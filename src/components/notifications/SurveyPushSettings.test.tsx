import{fireEvent,render,screen,waitFor}from'@testing-library/react'
import{SurveyPushSettings}from'./SurveyPushSettings'
import{apiGet}from'@/lib/api/client'
import{checkSurveyWorkerUpdate,pushWorkerReady}from'@/lib/notifications/pushClient'
jest.mock('@/components/app/PWAInstallProvider',()=>({usePWAInstall:()=>({ios:false,installed:true})}))
jest.mock('@/lib/api/client',()=>({apiGet:jest.fn(),apiPost:jest.fn()}))
jest.mock('@/lib/notifications/pushClient',()=>({supportsSurveyPush:()=>true,readySurveyWorker:jest.fn().mockResolvedValue({pushManager:{getSubscription:async()=>null}}),pushWorkerReady:jest.fn(),checkSurveyWorkerUpdate:jest.fn(),enableSurveyPush:jest.fn(),disableSurveyPush:jest.fn(),subscriptionHash:jest.fn()}))
const originalNotification=Object.getOwnPropertyDescriptor(window,'Notification')
beforeEach(()=>{jest.clearAllMocks();Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default'}});jest.mocked(apiGet).mockResolvedValue({available:true,publicKey:'synthetic-public-key',runner:{running:true,lastRunAt:null,lastError:null}});jest.mocked(pushWorkerReady).mockResolvedValue(false)})
afterEach(()=>{if(originalNotification)Object.defineProperty(window,'Notification',originalNotification);else Reflect.deleteProperty(window,'Notification')})
it('provides an explicit check and a way to review a waiting app update',async()=>{
 jest.mocked(checkSurveyWorkerUpdate).mockResolvedValue('waiting')
 const review=jest.fn();window.addEventListener('metardu:review-app-update',review)
 try{render(<SurveyPushSettings/>);fireEvent.click(await screen.findByRole('button',{name:'Check for app update'}));expect(await screen.findByRole('link',{name:'Review app update'})).toHaveAttribute('href','#metardu-app-update');expect(review).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Enable phone reminders'})).not.toBeInTheDocument()}finally{window.removeEventListener('metardu:review-app-update',review)}
})
it('enables the ordinary permission button only when the worker actually reports reminder support',async()=>{
 jest.mocked(checkSurveyWorkerUpdate).mockResolvedValue('ready')
 render(<SurveyPushSettings/>);fireEvent.click(await screen.findByRole('button',{name:'Check for app update'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Enable phone reminders'})).toBeEnabled())
})
it('shows an update-check failure without pretending that reminders are enabled',async()=>{
 jest.mocked(checkSurveyWorkerUpdate).mockRejectedValue(new Error('App update could not be checked. Try again when connected.'))
 render(<SurveyPushSettings/>);fireEvent.click(await screen.findByRole('button',{name:'Check for app update'}));expect(await screen.findByRole('alert')).toHaveTextContent('App update could not be checked');expect(screen.getByRole('button',{name:'Check for app update'})).toBeEnabled();expect(screen.queryByRole('button',{name:'Disable on this device'})).not.toBeInTheDocument()
})
