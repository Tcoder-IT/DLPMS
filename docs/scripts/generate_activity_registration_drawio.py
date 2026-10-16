import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="827", pageHeight="1169", math="0", shadow="0")
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
    start = add_start(305, 40)
    a1 = add_activity("Receive Land\nRegistration Application", 250, 110)
    d1 = add_decision("Documents\nValid?", 250, 210)
    
    a_reject = add_activity("Reject Application &\nNotify Citizen", 50, 220)
    end1 = add_end(100, 320)
    
    a2 = add_activity("Verify Field Survey /\nBoundary Data", 250, 330)
    d2 = add_decision("Survey Data\nAccurate?", 250, 430)
    
    a_resurvey = add_activity("Request Resurvey", 480, 440)
    
    a3 = add_activity("Calculate Registration\nFees", 250, 560)
    a4 = add_activity("Wait for Citizen\nPayment", 250, 660)
    d3 = add_decision("Payment\nCompleted?", 250, 760)
    
    a5 = add_activity("Update CIS Database", 250, 880)
    a6 = add_activity("Generate Digital\nCertificate", 250, 980)
    end2 = add_end(300, 1080)
    
    # Edges
    add_edge(start, a1)
    add_edge(a1, d1)
    
    add_edge(d1, a_reject, label="[No]")
    add_edge(a_reject, end1)
    
    add_edge(d1, a2, label="[Yes]")
    add_edge(a2, d2)
    
    add_edge(d2, a_resurvey, label="[No]")
    # Route resurvey back to a2
    add_edge(a_resurvey, a2, points=[(550, 360)])
    
    add_edge(d2, a3, label="[Yes]")
    add_edge(a3, a4)
    add_edge(a4, d3)
    
    # Wait for payment loop (No)
    add_edge(d3, a4, label="[No]", points=[(180, 800), (180, 690)])
    
    add_edge(d3, a5, label="[Yes]")
    add_edge(a5, a6)
    add_edge(a6, end2)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\ActivityProcessRegistration.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\ActivityProcessRegistration.drawio")
