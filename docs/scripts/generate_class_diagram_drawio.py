import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1000", pageHeight="1000", math="0", shadow="0")
    root = ET.SubElement(mxGraphModel, "root")
    
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    
    cell_id_counter = 2
    def get_id():
        nonlocal cell_id_counter
        curr = cell_id_counter
        cell_id_counter += 1
        return str(curr)

    def add_class(name, attrs, methods, x, y, stereotype=None):
        id_ = get_id()
        html = '<p style="margin:0px;margin-top:4px;text-align:center;">'
        if stereotype:
            html += f'&lt;&lt;{stereotype}&gt;&gt;<br/>'
        html += f'<b>{name}</b></p><hr size="1" style="margin:4px 0px;"/>'
        
        for attr in attrs:
            html += f'<p style="margin:0px;margin-left:8px;text-align:left;">{attr}</p>'
            
        html += '<hr size="1" style="margin:4px 0px;"/>'
        
        for method in methods:
            html += f'<p style="margin:0px;margin-left:8px;text-align:left;">{method}</p>'
            
        # Add a bunch of break tags just to ensure space if it's small? No, height handles it
        
        style = "whiteSpace=wrap;html=1;align=center;verticalAlign=top;fillColor=#f5f5f5;fontColor=#333333;strokeColor=#666666;"
        cell = ET.Element("mxCell", id=id_, value=html, style=style, vertex="1", parent="1")
        # Estimate height based on number of lines
        num_lines = 2 + len(attrs) + len(methods) + (1 if stereotype else 0)
        height = max(140, num_lines * 18 + 20)
        
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="200", height=str(height), **{"as": "geometry"})
        root.append(cell)
        return id_

    def add_edge(source, target, label="", style=""):
        id_ = get_id()
        # Default style is simple line
        base_style = "endArrow=none;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;"
        if style:
            base_style = style + ";html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;"
            
        cell = ET.Element("mxCell", id=id_, value=label, style=base_style, edge="1", parent="1", source=source, target=target)
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        root.append(cell)
        return id_
        
    def add_straight_edge(source, target, label="", style=""):
        id_ = get_id()
        base_style = "endArrow=none;html=1;rounded=0;"
        if style:
            base_style = style + ";html=1;rounded=0;"
            
        cell = ET.Element("mxCell", id=id_, value=label, style=base_style, edge="1", parent="1", source=source, target=target)
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        root.append(cell)
        return id_

    # Classes
    c_user = add_class("User", 
                       ["+ userId: UUID", "+ phoneNumber: String", "+ email: String", "+ passwordHash: String", "+ role: Enum", "+ isActive: Boolean"], 
                       ["+ authenticate()", "+ updateProfile()", "+ deactivate()"], 
                       400, 50)
                       
    c_owner = add_class("Owner", 
                        ["+ ownerId: String", "+ fullName: String", "+ identityDocument: String"], 
                        ["+ registerProperty()"], 
                        400, 300)
                        
    c_audit = add_class("AuditLog", 
                        ["+ logId: String", "+ timestamp: Date", "+ actionType: String", "+ snapshotBefore: String", "+ snapshotAfter: String", "+ hash: String"], 
                        ["+ verifyIntegrity()"], 
                        700, 50)
                        
    c_appointment = add_class("Appointment", 
                              ["+ appointmentId: String", "+ scheduledTime: Date", "+ status: String"], 
                              ["+ book()", "+ cancel()"], 
                              100, 300)
                              
    c_transfer = add_class("TransferRequest", 
                           ["+ requestId: String", "+ submissionDate: Date", "+ status: String"], 
                           ["+ submit()", "+ approve()", "+ reject()"], 
                           700, 300)
                           
    c_parcel = add_class("LandParcel", 
                         ["+ parcelId: String", "+ area: Float", "+ location: String", "+ boundary: Geometry"], 
                         ["+ calculateTax()"], 
                         400, 550)
                         
    c_payment = add_class("PaymentTransaction", 
                          ["+ transactionId: String", "+ amount: Float", "+ paymentDate: Date", "+ method: String"], 
                          ["+ processWebhook()"], 
                          100, 550)
                          
    c_tax = add_class("TaxRecord", 
                      ["+ taxId: String", "+ amountDue: Float", "+ amountPaid: Float", "+ status: String"], 
                      ["+ recordPayment()"], 
                      100, 800)
                      
    c_registry = add_class("LandRegistry", 
                           ["+ registryId: String", "+ registrationDate: Date", "+ historicalChain: String"], 
                           ["+ updateRecord()"], 
                           700, 550)
                           
    c_gis = add_class("GISService", 
                      [], 
                      ["+ verifyBoundary()", "+ renderMap()"], 
                      700, 800, stereotype="utility")

    # Relationships
    # Inheritance: Owner -> User
    add_straight_edge(c_owner, c_user, style="endArrow=block;endFill=0")
    
    # Dependency: AuditLog -> User
    add_straight_edge(c_audit, c_user, label="references", style="endArrow=classic;dashed=1")
    
    # Composition: LandParcel to Owner (Diamond on Owner side)
    add_straight_edge(c_parcel, c_owner, label="composes", style="endArrow=diamondThin;endFill=1")
    
    # Composition: TaxRecord to LandParcel (Diamond on LandParcel side)
    add_edge(c_tax, c_parcel, label="composes", style="endArrow=diamondThin;endFill=1")
    
    # Association: LandParcel to LandRegistry
    add_straight_edge(c_parcel, c_registry, label="associated with")
    
    # Dependency: GISService to LandParcel
    add_edge(c_gis, c_parcel, label="uses", style="endArrow=classic;dashed=1")
    
    # Associations for Appointment
    add_edge(c_appointment, c_owner, label="Books")
    add_edge(c_appointment, c_user, label="Handled By")
    
    # Associations for TransferRequest
    add_edge(c_transfer, c_owner, label="Seller")
    add_edge(c_transfer, c_user, label="Buyer")
    add_edge(c_transfer, c_parcel, label="Subject")
    
    # Associations for PaymentTransaction
    add_edge(c_payment, c_tax, label="pays")
    add_edge(c_payment, c_owner, label="initiated by")

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\ClassDiagram.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\ClassDiagram.drawio")
