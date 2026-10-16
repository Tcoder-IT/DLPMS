import xml.etree.ElementTree as ET
import xml.dom.minidom

def create_drawio_xml():
    mxfile = ET.Element("mxfile", host="Electron", modified="2023-10-24T00:00:00.000Z", agent="Mozilla/5.0", version="21.0.0", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="diagram_1", name="Page-1")
    mxGraphModel = ET.SubElement(diagram, "mxGraphModel", dx="1000", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1200", pageHeight="1600", math="0", shadow="0")
    root = ET.SubElement(mxGraphModel, "root")
    
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    
    cell_id_counter = 2
    def get_id():
        nonlocal cell_id_counter
        curr = cell_id_counter
        cell_id_counter += 1
        return str(curr)
    
    cells = []
    
    def add_actor(name, x, y):
        id_ = get_id()
        cell = ET.Element("mxCell", id=id_, value=name, style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;", vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="30", height="60", **{"as": "geometry"})
        root.append(cell)
        return id_
        
    def add_use_case(name, x, y):
        id_ = get_id()
        cell = ET.Element("mxCell", id=id_, value=name, style="ellipse;whiteSpace=wrap;html=1;", vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width="140", height="60", **{"as": "geometry"})
        root.append(cell)
        return id_
        
    def add_edge(source, target, label="", dashed=False):
        id_ = get_id()
        style = "endArrow=none;html=1;rounded=0;"
        if dashed:
            style = "endArrow=classic;html=1;dashed=1;rounded=0;"
        cell = ET.Element("mxCell", id=id_, value=label, style=style, edge="1", parent="1", source=source, target=target)
        geom = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
        if label:
            # We add a point just in case, but Draw.io handles routing
            ET.SubElement(geom, "mxPoint", **{"as": "offset"})
        root.append(cell)
        return id_
        
    def add_boundary(name, x, y, w, h):
        id_ = get_id()
        cell = ET.Element("mxCell", id=id_, value=name, style="swimlane;whiteSpace=wrap;html=1;startSize=23;", vertex="1", parent="1")
        ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})
        root.append(cell)
        return id_

    # System Boundary
    boundary_id = add_boundary("DLPMS System Boundary", 300, 50, 750, 1400)

    # ACTORS
    citizen_id = add_actor("Citizen", 100, 250)
    land_officer_id = add_actor("Land Officer", 100, 650)
    tax_official_id = add_actor("Tax Official", 100, 950)
    gis_officer_id = add_actor("GIS Officer", 100, 1150)
    admin_id = add_actor("System Admin", 100, 1350)

    # USE CASES - Citizen
    uc_register = add_use_case("Register", 350, 100)
    uc_login = add_use_case("Login", 550, 100)
    uc_apply_transfer = add_use_case("Apply for Transfer", 350, 180)
    uc_make_payment = add_use_case("Make Payment", 350, 260)
    uc_book_appt = add_use_case("Book Appointment", 350, 340)
    uc_view_records = add_use_case("View Land Records", 550, 180)
    uc_upload_docs = add_use_case("Upload Documents", 550, 260)
    uc_track_status = add_use_case("Track Status", 550, 340)
    uc_download_cert = add_use_case("Download Certificate", 350, 420)
    uc_search_records = add_use_case("Search Public Records", 550, 420)

    for uc in [uc_register, uc_login, uc_apply_transfer, uc_make_payment, uc_book_appt, uc_view_records, uc_upload_docs, uc_track_status, uc_download_cert, uc_search_records]:
        add_edge(citizen_id, uc)

    # Includes/Extends for Citizen
    uc_auth = add_use_case("Authenticate User", 800, 140)
    uc_receipt = add_use_case("Generate Tax Receipt", 800, 260)
    uc_sms = add_use_case("Send SMS Notification", 800, 340)

    add_edge(uc_apply_transfer, uc_auth, "<<include>>", dashed=True)
    add_edge(uc_make_payment, uc_receipt, "<<extend>>", dashed=True)
    add_edge(uc_book_appt, uc_sms, "<<include>>", dashed=True)

    # USE CASES - Land Officer
    uc_process_reg = add_use_case("Process Registration", 350, 550)
    uc_verify_docs = add_use_case("Verify Documents", 800, 600)
    uc_approve_transfer = add_use_case("Approve Transfer", 350, 630)
    uc_reject_transfer = add_use_case("Reject Transfer", 350, 710)
    uc_generate_reports = add_use_case("Generate Reports", 550, 550)
    uc_search_cis = add_use_case("Search CIS", 550, 630)
    
    uc_upload_bound = add_use_case("Upload Boundary", 800, 850)

    for uc in [uc_process_reg, uc_verify_docs, uc_approve_transfer, uc_reject_transfer, uc_generate_reports, uc_search_cis]:
        add_edge(land_officer_id, uc)
        
    add_edge(uc_approve_transfer, uc_verify_docs, "<<include>>", dashed=True)
    add_edge(uc_process_reg, uc_upload_bound, "<<extend>>", dashed=True)

    # USE CASES - Tax Official
    uc_calc_tax = add_use_case("Calculate Tax", 350, 850)
    uc_offline_payment = add_use_case("Record Offline Payment", 350, 930)
    uc_view_dashboard = add_use_case("View Dashboard", 550, 850)
    uc_gen_tax_report = add_use_case("Generate Tax Report", 550, 930)
    
    for uc in [uc_calc_tax, uc_offline_payment, uc_view_dashboard, uc_gen_tax_report, uc_receipt]:
        add_edge(tax_official_id, uc)

    # USE CASES - GIS Officer
    uc_verify_bound = add_use_case("Verify Boundary", 350, 1100)
    uc_view_maps = add_use_case("View Maps", 550, 1100)

    for uc in [uc_upload_bound, uc_verify_bound, uc_view_maps]:
        add_edge(gis_officer_id, uc)

    # USE CASES - System Admin
    uc_manage_users = add_use_case("Manage Users", 350, 1300)
    uc_view_audit = add_use_case("View Audit Logs", 550, 1300)
    uc_config_system = add_use_case("Configure System", 350, 1380)
    uc_perform_backup = add_use_case("Perform Backup", 550, 1380)

    for uc in [uc_manage_users, uc_view_audit, uc_config_system, uc_perform_backup]:
        add_edge(admin_id, uc)

    xmlstr = xml.dom.minidom.parseString(ET.tostring(mxfile)).toprettyxml(indent="  ")
    # Remove XML declaration to match Draw.io's format
    xmlstr = "\n".join(xmlstr.split("\n")[1:])
    return xmlstr

if __name__ == "__main__":
    xml_content = create_drawio_xml()
    with open(r"d:\from C\VETHIO\DLPMS\docs\diagrams\UseCaseDiagram.drawio", "w", encoding="utf-8") as f:
        f.write(xml_content)
    print("Draw.io file generated successfully at d:\\from C\\VETHIO\\DLPMS\\docs\\diagrams\\UseCaseDiagram.drawio")
