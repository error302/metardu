import {NextResponse} from 'next/server'
import {apiHandler} from '@/lib/apiHandler'
import {z} from 'zod'
import {resolveProjectRoomAccess} from '@/lib/realtime/projectRoomAccess'
import {signRoomTicket,verifyRoomTicket} from '@/lib/realtime/roomTicket'
import {ROOM_PROTOCOL_VERSION} from '@/lib/realtime/collaborationProtocol'

export const dynamic='force-dynamic'
const TicketSchema=z.object({projectId:z.string().guid()}).strict()
/** Current authenticated project access is resolved by the server on every short-lived grant. */
export const POST=apiHandler(
  {auth:true,rateLimit:{max:30,windowMs:60000},schema:TicketSchema},
  async(_req,ctx)=>{
    const {projectId}=ctx.body as z.infer<typeof TicketSchema>
    const role=await resolveProjectRoomAccess(ctx.userId,projectId)
    if(!role)return NextResponse.json({error:'Project not accessible',code:'FORBIDDEN'},{status:403})
    const secret=process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET
    if(!secret)return NextResponse.json({error:'Collaboration is unavailable',code:'WS_NOT_CONFIGURED'},{status:503})
    const userName=ctx.session?.user?.name?.trim().slice(0,120)||undefined
    const ticket=signRoomTicket(secret,ctx.userId,projectId,userName,role)
    const claims=verifyRoomTicket(secret,ticket,projectId)
    if(!claims)throw new Error('Room grant verification failed')
    return NextResponse.json({ticket,projectId,userId:ctx.userId,role,protocolVersion:ROOM_PROTOCOL_VERSION,expiresAt:claims.expiresAt},
      {headers:{'Cache-Control':'no-store'}})
  }
)
