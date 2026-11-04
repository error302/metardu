import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import MarketplacePage from '@/app/marketplace/page'
import {fetchListings,fetchInquiries} from '@/lib/marketplace/apiClient'
jest.mock('@/lib/subscription/subscriptionContext',()=>({useSubscription:()=>({plan:'pro',isAdmin:false,isTrialing:false,loading:false})}))
jest.mock('@/lib/marketplace/apiClient',()=>({fetchListings:jest.fn(),fetchInquiries:jest.fn(),createListing:jest.fn(),sendInquiry:jest.fn()}))
const listing={id:'synthetic',type:'sale',category:'total_station',title:'Synthetic total station',brand:'Example',model:'S1',condition:'good',description:'Synthetic data',price:1000,currency:'KES',location:'Nairobi',country:'Kenya',sellerName:'Example',sellerContact:'',images:['https://example.invalid/one.jpg','https://example.invalid/two.jpg'],postedAt:'2026-11-03T00:00:00Z',sold:false,verified:false}
function show(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><MarketplacePage /></QueryClientProvider>)}
beforeEach(()=>{jest.clearAllMocks();jest.mocked(fetchListings).mockResolvedValue([listing] as never);jest.mocked(fetchInquiries).mockResolvedValue([])})
test('a listing opens and an image can be inspected without closing listing details',async()=>{
 show();fireEvent.click(await screen.findByRole('button',{name:'View Synthetic total station'}))
 const details=await screen.findByRole('dialog',{name:'Synthetic total station'})
 expect(within(details).getAllByRole('heading',{name:'Synthetic total station'})).toHaveLength(1)
 fireEvent.click(within(details).getByRole('button',{name:'Open image in full screen'}))
 const image=await screen.findByRole('dialog',{name:'Listing image'})
 fireEvent.click(within(image).getByRole('button',{name:'Close lightbox'}))
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Listing image'})).not.toBeInTheDocument())
 expect(screen.getByRole('dialog',{name:'Synthetic total station'})).toBeInTheDocument()
})
test('failed listing retrieval is not shown as an empty marketplace',async()=>{
 jest.mocked(fetchListings).mockRejectedValue(new Error('offline'));show()
 expect(await screen.findByRole('alert')).toHaveTextContent('Listings could not be loaded')
 expect(screen.queryByText('No listings yet')).not.toBeInTheDocument()
})

test('gallery thumbnails have names and keyboard use of next photo does not open the lightbox',async()=>{
 show();fireEvent.click(await screen.findByRole('button',{name:'View Synthetic total station'}))
 const details=await screen.findByRole('dialog',{name:'Synthetic total station'})
 expect(within(details).getByRole('button',{name:'Show photo 1'})).toHaveAttribute('aria-pressed','true')
 const next=within(details).getByRole('button',{name:'Next image'})
 fireEvent.keyDown(next,{key:'Enter'});fireEvent.click(next)
 expect(screen.queryByRole('dialog',{name:'Listing image'})).not.toBeInTheDocument()
 expect(within(details).getByRole('button',{name:'Show photo 2'})).toHaveAttribute('aria-pressed','true')
})
