import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1200", pageHeight="1200", math="0", shadow="0")
    root = ET.SubElement(mxGraphModel, "root")
    
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    
    cell_id_counter = 2
    def get_id():
        nonlocal cell_id_counter
        curr = cell_id_counter
        cell_id_counter += 1
        return str(curr)

    def add_native_class(name, attrs, methods, x, y, stereotype=None):
        title_height = 40 if stereotype else 26
        
        fields_html = ""
        for attr in attrs:
            fields_html += f"<div>{attr}</div>"
        fields_height = max(10, len(attrs) * 16 + 10)
        
        methods_html = ""
        for method in methods:
            methods_html += f"<div>{method}</div>"
        methods_height = max(10, len(methods) * 16 + 10)
        
        total_height = title_height + fields_height + 8 + methods_height
        
        class_name_display = name
        if stereotype:
            class_name_display = f"&lt;&lt;{stereotype}&gt;&gt;<br/><b>{name}</b>"
            
        id_container = get_id()
        style_container = f"swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize={title_height};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;"
        cell_c = ET.Element("mxCell", id=id_container, value=class_name_display, style=style_container, vertex="1", parent="1")
        ET.SubElement(cell_c, "mxGeometry", x=str(x), y=str(y), width="220", height=str(total_height), **{"as": "geometry"})
        root.append(cell_c)
        
        id_fields = get_id()
        style_text = "text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;html=1;"
        cell_f = ET.Element("mxCell", id=id_fields, value=fields_html, style=style_text, vertex="1", parent=id_container)
        ET.SubElement(cell_f, "mxGeometry", y=str(title_height), width="220", height=str(fields_height), **{"as": "geometry"})
        root.append(cell_f)
        
        id_line = get_id()
        style_line = "line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;"
        cell_l = ET.Element("mxCell", id=id_line, value="", style=style_line, vertex="1", parent=id_container)
        ET.SubElement(cell_l, "mxGeometry", y=str(title_height + fields_height), width="220", height="8", **{"as": "geometry"})
        root.append(cell_l)
        
        id_methods = get_id()
        cell_m = ET.Element("mxCell", id=id_methods, value=methods_html, style=style_text, vertex="1", parent=id_container)
        ET.SubElement(cell_m, "mxGeometry", y=str(title_height + fields_height + 8), width="220", height=str(methods_height), **{"as": "geometry"})
        root.append(cell_m)
        
        return id_container

    def add_edge(source, target, label="", style="", exit_x=None, exit_y=None, entry_x=None, entry_y=None, points=None):
        id_ = get_id()
        base_style = "endArrow=none;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;"
        if style:
            base_style = style + ";html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;"
            
        if exit_x is not None:
            base_style += f"exitX={exit_x};exitY={exit_y};exitDx=0;exitDy=0;"
        if entry_x is not None:
            base_style += f"entryX={entry_x};entryY={entry_y};entryDx=0;entryDy=0;"
            
        cell = ET.Element("mxCell", id=id_, value=label, style=base_style, edge="1", parent="1", source=source, target=target)
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        if points:
            arr = ET.SubElement(geom, "Array", **{"as": "points"})
            for (px, py) in points:
                ET.SubElement(arr, "mxPoint", x=str(px), y=str(py))
        root.append(cell)
        return id_

    # Classes
    c_user = add_native_class("User", 
                       ["+ userId: UUID", "+ phoneNumber: String", "+ email: String", "+ passwordHash: String", "+ role: Enum", "+ isActive: Boolean"], 
                       ["+ authenticate()", "+ updateProfile()", "+ deactivate()"], 
                       400, 50)
                       
    c_owner = add_native_class("Owner", 
                        ["+ ownerId: String", "+ fullName: String", "+ identityDocument: String"], 
                        ["+ registerProperty()"], 
                        400, 350)
                        
    c_audit = add_native_class("AuditLog", 
                        ["+ logId: String", "+ timestamp: Date", "+ actionType: String", "+ snapshotBefore: String", "+ snapshotAfter: String", "+ hash: String"], 
                        ["+ verifyIntegrity()"], 
                        750, 50)
                        
    c_appointment = add_native_class("Appointment", 
                              ["+ appointmentId: String", "+ scheduledTime: Date", "+ status: String"], 
                              ["+ book()", "+ cancel()"], 
                              50, 50)
                              
    c_transfer = add_native_class("TransferRequest", 
                           ["+ requestId: String", "+ submissionDate: Date", "+ status: String"], 
                           ["+ submit()", "+ approve()", "+ reject()"], 
                           750, 350)
                           
    c_parcel = add_native_class("LandParcel", 
                         ["+ parcelId: String", "+ area: Float", "+ location: String", "+ boundary: Geometry"], 
                         ["+ calculateTax()"], 
                         400, 650)
                         
    c_payment = add_native_class("PaymentTransaction", 
                          ["+ transactionId: String", "+ amount: Float", "+ paymentDate: Date", "+ method: String"], 
                          ["+ processWebhook()"], 
                          50, 350)
                          
    c_tax = add_native_class("TaxRecord", 
                      ["+ taxId: String", "+ amountDue: Float", "+ amountPaid: Float", "+ status: String"], 
                      ["+ recordPayment()"], 
                      50, 650)
                      
    c_registry = add_native_class("LandRegistry", 
                           ["+ registryId: String", "+ registrationDate: Date", "+ historicalChain: String"], 
                           ["+ updateRecord()"], 
                           750, 650)
                           
    c_gis = add_native_class("GISService", 
                      [], 
                      ["+ verifyBoundary()", "+ renderMap()"], 
                      400, 950, stereotype="utility")

    # Edges
    add_edge(c_owner, c_user, style="endArrow=block;endFill=0", exit_x=0.5, exit_y=0, entry_x=0.5, entry_y=1)
    
    add_edge(c_audit, c_user, label="references", style="endArrow=classic;dashed=1", exit_x=0, exit_y=0.5, entry_x=1, entry_y=0.5)
    
    add_edge(c_parcel, c_owner, label="composes", style="endArrow=diamondThin;endFill=1", exit_x=0.5, exit_y=0, entry_x=0.5, entry_y=1)
    
    add_edge(c_tax, c_parcel, label="composes", style="endArrow=diamondThin;endFill=1", exit_x=1, exit_y=0.5, entry_x=0, entry_y=0.5)
    
    add_edge(c_parcel, c_registry, label="associated with", exit_x=1, exit_y=0.5, entry_x=0, entry_y=0.5)
    
    add_edge(c_gis, c_parcel, label="uses", style="endArrow=classic;dashed=1", exit_x=0.5, exit_y=0, entry_x=0.5, entry_y=1)
    
    add_edge(c_appointment, c_owner, label="Books", exit_x=0.5, exit_y=1, entry_x=0, entry_y=0.25, points=[(160, 250), (160, 380)])
    
    add_edge(c_appointment, c_user, label="Handled By", exit_x=1, exit_y=0.5, entry_x=0, entry_y=0.5)
    
    add_edge(c_transfer, c_owner, label="Seller", exit_x=0, exit_y=0.5, entry_x=1, entry_y=0.5)
    
    add_edge(c_transfer, c_user, label="Buyer", exit_x=0.5, exit_y=0, entry_x=1, entry_y=0.75, points=[(860, 300), (860, 220)])
    
    add_edge(c_transfer, c_parcel, label="Subject", exit_x=0.5, exit_y=1, entry_x=1, entry_y=0.25, points=[(860, 500), (860, 680)])
    
    add_edge(c_payment, c_tax, label="pays", exit_x=0.5, exit_y=1, entry_x=0.5, entry_y=0)
    
    add_edge(c_payment, c_owner, label="initiated by", exit_x=1, exit_y=0.5, entry_x=0, entry_y=0.5)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\ClassDiagram.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Perfect Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\ClassDiagram.drawio")
