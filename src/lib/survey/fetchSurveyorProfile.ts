import { db } from '@/lib/db'
export interface SurveyorProfile {
  surveyorName:string
  iskNumber:string
  licenseNumber:string
  firmName:string
  referenceNumber:string
}
/** Resolve each field separately: a project name must not hide the owner's licence. */
export async function fetchSurveyorProfile(projectId:string):Promise<SurveyorProfile> {
  const result=await db.query<{surveyor_name:string;license_number:string;isk_number:string;firm_name:string}>(
    `SELECT COALESCE(NULLIF(p.surveyor_name,''),NULLIF(sp.full_name,''),pr.full_name,u.full_name,'') AS surveyor_name,
      COALESCE(NULLIF(p.surveyor_license,''),sp.license_number,'') AS license_number,
      COALESCE(NULLIF(p.isk_reg_no,''),sp.isk_number,pr.isk_number,'') AS isk_number,
      COALESCE(NULLIF(p.firm_name,''),sp.firm_name,pr.firm_name,'') AS firm_name
     FROM projects p LEFT JOIN surveyor_profiles sp ON sp.user_id=p.user_id
     LEFT JOIN profiles pr ON pr.id=p.user_id LEFT JOIN users u ON u.id=p.user_id
     WHERE p.id=$1`,[projectId]);
  const row=result.rows[0];
  return {surveyorName:row?.surveyor_name || '',licenseNumber:row?.license_number || '',iskNumber:row?.isk_number || '',firmName:row?.firm_name || '',referenceNumber:''};
}
