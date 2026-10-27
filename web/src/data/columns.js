/** Contratos de lectura. Los campos internos del worker y datos de Auth nunca forman parte de estas listas. */
export const tableColumns = {
  comments: "id,load,body,created_by,created_at",
  incidents:
    "id,load,category,severity,description,action_taken,created_by,created_at,deleted_at,deleted_by",
  load_history: "id,load,actor,changed_at,before_data,after_data",
  communications:
    "id,load,event_type,reason,actor,channel,notice_type,public_message,manual_message,created_at",
  profiles:
    "id,display_name,role,active,contact_email,password_ready,login_name,updated_at,original_removed",
  customer_assignments: "customer,customer_key,owner_id,updated_by,updated_at",
  load_followers: "load,user_id,created_at",
  user_following: "user_id,followed_user",
  shift_tasks:
    "id,load,note,assigned_to,assigned_csr,shift,state,follow_up_at,color,created_by,created_at,updated_at,resolved_at,schedule_id,scheduled_for,cancel_reason",
  portal_access: "user_id,customer,active,updated_at",
  shift_closures: "id,body,shift,created_by,created_at",
  admin_events: "id,action,details,actor,created_at",
  original_routes:
    "route_key,origin_key,destination_key,miles,hours,straight_miles,google_miles,google_hours,google_at,google_by,google_state,created_by,created_at",
  original_places:
    "place_key,kind,searched_text,formatted_address,latitude,longitude,created_by,created_at",
  original_radar: "singleton,file_name,records,visible,updated_at,updated_by",
  original_preferences: "user_id,templates,labels,updated_at",
  reserved_load_history:
    "id,reserved_id,event,note,actor,changed_at,before_data,after_data",
};
