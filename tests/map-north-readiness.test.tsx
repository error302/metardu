import React from 'react'
import {render,screen} from '@testing-library/react'
import type Map from 'ol/Map'
import {NorthArrowOverlay} from '@/app/map/components/NorthArrowOverlay'
const mockMapContext=React.createContext({mapReady:false})
jest.mock('@/app/map/MapReactContext',()=>({useMapContext:()=>jest.requireActual<typeof import('react')>('react').useContext(mockMapContext)}))
function north(ref:React.MutableRefObject<Map|null>,ready:boolean){return <mockMapContext.Provider value={{mapReady:ready}}><NorthArrowOverlay mapInstance={ref}/></mockMapContext.Provider>}
function viewFixture(){const view={getRotation:jest.fn(()=>0),on:jest.fn(),un:jest.fn(),animate:jest.fn()};return {view,map:{getView:()=>view} as unknown as Map}}
test('north control appears when the asynchronously created map becomes ready',()=>{
  const ref={current:null as Map|null},fixture=viewFixture()
  const rendered=render(north(ref,false));expect(screen.queryByRole('button',{name:'True North'})).toBeNull()
  ref.current=fixture.map;rendered.rerender(north(ref,true))
  expect(screen.getByRole('button',{name:'True North'})).toBeDisabled();expect(fixture.view.on).toHaveBeenCalledWith('change:rotation',expect.any(Function))
})
test('map teardown hides the control and removes its rotation listener',()=>{
  const fixture=viewFixture(),ref={current:fixture.map as Map|null}
  const rendered=render(north(ref,true));expect(screen.getByRole('button',{name:'True North'})).toBeInTheDocument()
  ref.current=null;rendered.rerender(north(ref,false))
  expect(screen.queryByRole('button',{name:'True North'})).toBeNull();expect(fixture.view.un).toHaveBeenCalledWith('change:rotation',expect.any(Function))
})
