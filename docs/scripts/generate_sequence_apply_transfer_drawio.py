import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1200", pageHeight="1000", math="0", shadow="0")
    root = ET.SubElement(mxGraphModel, "root")
    
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    
    cell_id_counter = 2
    def get_id():
        nonlocal cell_id_counter
        curr = cell_id_counter
        cell_id_counter += 1
        return str(curr)
    
    def add_lifeline(name, x, y, width, height, is_actor=False):
        id_ = get_id()
        style = "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;"
        if is_actor:
            style += "participant=umlActor;"
        cell = ET.Element("mxCell", id=id_, value=name, style=style, vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(width), height=str(height), **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_message(source_x, source_y, target_x, target_y, label="", dashed=False, align="center"):
        id_ = get_id()
        style = "html=1;verticalAlign=bottom;rounded=0;"
        if dashed:
            style += "endArrow=open;dashed=1;"
        else:
            style += "endArrow=block;"
            
        if align == "left":
            style += "align=left;spacingLeft=2;"
            
        cell = ET.Element("mxCell", id=id_, value=label, style=style, edge="1", parent="1")
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        ET.SubElement(geom, "mxPoint", x=str(source_x), y=str(source_y), **{"as": "sourcePoint"})
        ET.SubElement(geom, "mxPoint", x=str(target_x), y=str(target_y), **{"as": "targetPoint"})
        root.append(cell)
        return id_

    # Lifelines
    add_lifeline("Citizen", 100, 50, 40, 750, is_actor=True)
    add_lifeline("DLPMS Backend", 350, 50, 100, 750)
    add_lifeline("Tax Record DB", 600, 50, 100, 750)
    add_lifeline("CIS Database", 850, 50, 100, 750)

    # Centers
    c_cit = 120
    c_back = 400
    c_tax = 650
    c_cis = 900

    # Messages
    add_message(c_cit, 150, c_back, 150, "1. Authenticate & Request Transfer")
    add_message(c_back, 200, c_tax, 200, "2. Check Tax Hold Status")
    add_message(c_tax, 250, c_back, 250, "3. Return Tax Status (Clear)", dashed=True)
    add_message(c_back, 300, c_cis, 300, "4. Validate Buyer Details")
    add_message(c_cis, 350, c_back, 350, "5. Buyer Validated", dashed=True)
    
    add_message(c_back, 400, c_cit, 400, "6. Prompt Document Upload", dashed=True)
    
    add_message(c_cit, 480, c_back, 480, "7. Upload ID, Photos, Forms")
    
    add_message(c_back, 550, c_cis, 550, "8. Save Pending Transfer Request")
    add_message(c_cis, 600, c_back, 600, "9. Request Saved Successfully", dashed=True)
    
    add_message(c_back, 670, c_cit, 670, "10. Application Submitted Notification", dashed=True)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\SequenceApplyForTransfer.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\SequenceApplyForTransfer.drawio")
