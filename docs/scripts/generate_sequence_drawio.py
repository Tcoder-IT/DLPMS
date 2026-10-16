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

    def add_self_message(x, y, label=""):
        id_ = get_id()
        style = "edgeStyle=orthogonalEdgeStyle;html=1;align=left;spacingLeft=2;endArrow=block;rounded=0;"
        cell = ET.Element("mxCell", id=id_, value=label, style=style, edge="1", parent="1")
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        ET.SubElement(geom, "mxPoint", x=str(x), y=str(y), **{"as": "sourcePoint"})
        ET.SubElement(geom, "mxPoint", x=str(x), y=str(y+30), **{"as": "targetPoint"})
        
        arr = ET.SubElement(geom, "Array", **{"as": "points"})
        ET.SubElement(arr, "mxPoint", x=str(x+40), y=str(y))
        ET.SubElement(arr, "mxPoint", x=str(x+40), y=str(y+30))
        
        root.append(cell)
        return id_

    # Lifelines
    add_lifeline("Citizen", 100, 50, 40, 850, is_actor=True)
    add_lifeline("DLPMS Backend", 300, 50, 100, 850)
    add_lifeline("telebirr Gateway", 500, 50, 100, 850)
    add_lifeline("Tax Record DB", 700, 50, 100, 850)
    add_lifeline("Notification Service", 900, 50, 100, 850)

    # Centers
    c_cit = 120
    c_back = 350
    c_gate = 550
    c_db = 750
    c_notif = 950

    # Messages
    add_message(c_cit, 150, c_back, 150, "1. Initiate payment")
    add_message(c_back, 200, c_gate, 200, "2. Validate & forward request")
    add_message(c_gate, 250, c_cit, 250, "3. Return payment URL / USSD push", dashed=True)
    add_message(c_cit, 300, c_gate, 300, "4. Complete payment on phone")
    add_message(c_gate, 350, c_back, 350, "5. Asynchronous webhook callback")
    
    add_self_message(c_back, 400, "6. Validate webhook signature")
    
    add_message(c_back, 480, c_db, 480, "7. Update Tax Record status")
    add_message(c_db, 530, c_back, 530, "Status updated", dashed=True)
    
    add_message(c_back, 580, c_notif, 580, "8. Trigger SMS confirmation")
    add_message(c_notif, 630, c_cit, 630, "SMS sent", dashed=True)
    
    add_message(c_back, 680, c_notif, 680, "9. Trigger Email receipt")
    add_message(c_notif, 730, c_cit, 730, "Email sent", dashed=True)
    
    add_message(c_back, 780, c_cit, 780, "10. Return success response", dashed=True)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\SequencePaymentDiagram.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\SequencePaymentDiagram.drawio")
