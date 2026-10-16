"""
patch_docx.py  –  Post-processing patch for the formatted DLPMS document.
Fixes:
  1. Removes all consecutive (duplicate) blank paragraphs throughout.
  2. Forces direct-XML run formatting for all Heading 1 paragraphs to guarantee
     Times New Roman 14 pt Bold regardless of style inheritance.
"""

import docx
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


INPUT  = r"d:\from C\VETHIO\DLPMS\FINALYEAR\Digital_Land_Property_Management_System_Proposal (1) - Formatted.docx"
OUTPUT = r"d:\from C\VETHIO\DLPMS\FINALYEAR\Digital_Land_Property_Management_System_Proposal (1) - Formatted.docx"

FONT_NAME = 'Times New Roman'


def force_run_font(run, font_name, size_pt, bold):
    """Apply font properties directly to XML run properties."""
    rPr = run.element.get_or_add_rPr()

    # ── Bold ─────────────────────────────────────────────────────────────
    b_el = rPr.find(qn('w:b'))
    if b_el is None:
        b_el = OxmlElement('w:b')
        rPr.insert(0, b_el)
    if bold:
        b_el.set(qn('w:val'), '1')
    else:
        b_el.set(qn('w:val'), '0')

    # ── Font size ────────────────────────────────────────────────────────
    twips = str(int(size_pt * 2))           # half-points
    for tag in ('w:sz', 'w:szCs'):
        el = rPr.find(qn(tag))
            
            
            
            
            
            
            
            
            
        if el is None:
            el = OxmlElement(tag)
            rPr.append(el)
        el.set(qn('w:val'), twips)

    # ── Font name ────────────────────────────────────────────────────────
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rFonts.set(qn(attr), font_name)

    # ── python-docx mirror ───────────────────────────────────────────────
    run.font.name  = font_name
    run.font.size  = Pt(size_pt)
    run.bold       = bold


def main():
    print("Loading formatted document...")
    doc = docx.Document(INPUT)

    # ────────────────────────────────────────────────────────────────────
    # 1. Re-format ALL Heading 1 paragraphs with forced XML run properties
    # ────────────────────────────────────────────────────────────────────
    print("Re-applying Heading 1 run formatting...")
    h1_count = 0
    for para in doc.paragraphs:
        if para.style.name != 'Heading 1':
            continue
        if not para.text.strip():
            continue
        h1_count += 1
        para.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf = para.paragraph_format
        pf.space_before       = Pt(12)
        pf.space_after        = Pt(12)
        pf.first_line_indent  = Inches(0)
        pf.left_indent        = Inches(0)
        if not para.runs:
            # Create a run if none exists (shouldn't happen, but defensive)
            run = para.add_run(para.text)
            force_run_font(run, FONT_NAME, 14, True)
        else:
            for run in para.runs:
                force_run_font(run, FONT_NAME, 14, True)
    print(f"  Processed {h1_count} Heading 1 paragraphs.")

    # ────────────────────────────────────────────────────────────────────
    # 2. Remove ALL consecutive blank paragraphs (entire document)
    # ────────────────────────────────────────────────────────────────────
    print("Removing consecutive blank paragraphs...")
    body = doc.element.body
    to_delete = []
    prev_blank = False
    for el in list(body):
        if el.tag == qn('w:p'):
            para = docx.text.paragraph.Paragraph(el, doc)
            is_blank = not para.text.strip()
            # Check for images
            drawing_tag = qn('w:drawing')
            pict_tag    = qn('w:pict')
            has_img = any(c.tag in (drawing_tag, pict_tag) for c in el.iter())
            if is_blank and not has_img:
                if prev_blank:
                    to_delete.append(el)
                else:
                    prev_blank = True
            else:
                prev_blank = False
        else:
            # Tables reset the blank-line counter
            prev_blank = False

    removed = 0
    for el in to_delete:
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)
            removed += 1
    print(f"  Removed {removed} consecutive blank paragraphs.")

    # ────────────────────────────────────────────────────────────────────
    # 3. Save
    # ────────────────────────────────────────────────────────────────────
    print("Saving patched document...")
    doc.save(OUTPUT)
    print(f"Done! Saved to:\n  {OUTPUT}")


if __name__ == '__main__':
    main()
