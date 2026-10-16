import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1000", pageHeight="1200", math="0", shadow="0")
    root = ET.SubElement(mxGraphModel, "root")
    
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    
    cell_id_counter = 2
    def get_id():
        nonlocal cell_id_counter
        curr = cell_id_counter
        cell_id_counter += 1
        return str(curr)

    def add_start(x, y):
        id_ = get_id()
        style = "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;"
        cell = ET.Element("mxCell", id=id_, value="", style=style, vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="30", height="30", **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_end(x, y):
        id_ = get_id()
        style = "ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#000000;strokeWidth=2;"
        cell = ET.Element("mxCell", id=id_, value="", style=style, vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="40", height="40", **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_activity(name, x, y):
        id_ = get_id()
        style = "rounded=1;whiteSpace=wrap;html=1;arcSize=20;fillColor=#dae8fc;strokeColor=#6c8ebf;"
        cell = ET.Element("mxCell", id=id_, value=name, style=style, vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="140", height="60", **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_decision(name, x, y):
        id_ = get_id()
        style = "rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
        cell = ET.Element("mxCell", id=id_, value=name, style=style, vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="140", height="80", **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_edge(source, target, label="", points=None):
        id_ = get_id()
        style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;"
        cell = ET.Element("mxCell", id=id_, value=label, style=style, edge="1", parent="1", source=source, target=target)
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        if points:
            arr = ET.SubElement(geom, "Array", **{"as": "points"})
            for (px, py) in points:
                ET.SubElement(arr, "mxPoint", x=str(px), y=str(py))
        root.append(cell)
        return id_

    # Nodes
    start = add_start(285, 40)
    a1 = add_activity("Authenticate /\nLogin to Mobile App", 230, 110)
    a2 = add_activity("Select 'Book\nAppointment' Service", 230, 200)
    a3 = add_activity("Choose Available\nDate and Time Slot", 230, 290)
    a4 = add_activity("Confirm\nAppointment Details", 230, 380)
    d1 = add_decision("Payment\nRequired?", 230, 470)
    
    a5 = add_activity("Initiate Payment via\ntelebirr Gateway", 450, 480)
    d2 = add_decision("Payment\nSuccess?", 450, 570)
    a6 = add_activity("Display Error &\nPrompt Retry", 650, 580)
    
    a7 = add_activity("Generate\nPayment Receipt", 450, 680)
    
    a8 = add_activity("Save Appointment to\nSchedule Database", 230, 770)
    a9 = add_activity("Send SMS/Email\nConfirmation", 230, 860)
    end = add_end(280, 950)
    
    # Edges
    add_edge(start, a1)
    add_edge(a1, a2)
    add_edge(a2, a3)
    add_edge(a3, a4)
    add_edge(a4, d1)
    
    # D1 path No
    add_edge(d1, a8, label="[No]")
    
    # D1 path Yes
    add_edge(d1, a5, label="[Yes]")
    add_edge(a5, d2)
    
    # D2 path No
    add_edge(d2, a6, label="[No]")
    add_edge(a6, a5, points=[(720, 510)]) # loop back to a5
    
    # D2 path Yes
    add_edge(d2, a7, label="[Yes]")
    
    # Rejoin path
    add_edge(a7, a8)
    
    add_edge(a8, a9)
    add_edge(a9, end)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\ActivityBookAppointment.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\ActivityBookAppointment.drawio")
