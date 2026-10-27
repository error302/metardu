'use client'
import { useEffect, useRef, useState } from 'react'
import type * as Three from 'three'
import type {RoadTerrainData} from '@/lib/engineering/roadTerrain'
import {
  roadWorkbenchSection,
  type RoadWorkbenchModel,
} from '@/lib/engineering/roadWorkbench'
import {
  buildRoadWorkbenchScene,
  roadWorkbenchLineSegments,
} from '@/lib/engineering/roadWorkbenchScene'
type XYZ = { easting: number; northing: number; elevation: number }
/** Render evaluated design and original section lines; never triangulate inferred ground. */
export default function RoadWorkbench3D({
  model,
  chainage,
  terrain,
}: {
  model: RoadWorkbenchModel
  chainage: number
  terrain?: RoadTerrainData
}) {
  const host = useRef<HTMLDivElement>(null),
    selected = useRef(chainage),
    update = useRef<((ch: number) => void) | null>(null),
    fitView = useRef<(() => void) | null>(null)
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    selected.current = chainage
    update.current?.(chainage)
  }, [chainage])
  useEffect(() => {
    const container = host.current
    if (!container) return
    let cancelled = false,
      cleanup = () => {}
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const [THREE, { OrbitControls }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
        ])
        if (cancelled) return
        const data = buildRoadWorkbenchScene(model),
          first = data.origin
        if (!first)
          throw Error(
            'No referenced 3D design or measured section levels are available.',
          )
        const local = (p: XYZ) =>
          new THREE.Vector3(
            p.easting - first.easting,
            p.elevation - first.elevation,
            -(p.northing - first.northing),
          )
        const scene = new THREE.Scene(),
          camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000000)
        scene.background = new THREE.Color(0x151b22)
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.domElement.setAttribute(
          'aria-label',
          terrain?'Interactive road design and retained terrain':'Interactive road design and measured sections',
        )
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        const ownedGeometry: Three.BufferGeometry[] = [],
          ownedMaterials: Three.Material[] = []
        let frame = 0,
          observer: ResizeObserver | null = null
        const selection = new THREE.Group()
        let selectionLine: Three.Line<
          Three.BufferGeometry,
          Three.LineBasicMaterial
        > | null = null
        scene.add(selection)
        cleanup = () => {
          cancelAnimationFrame(frame)
          observer?.disconnect()
          update.current = null
          fitView.current = null
          controls.dispose()
          ownedGeometry.forEach((g) => g.dispose())
          ownedMaterials.forEach((m) => m.dispose())
          selectionLine?.geometry.dispose()
          selectionLine?.material.dispose()
          renderer.dispose()
          renderer.forceContextLoss()
          renderer.domElement.remove()
        }
        const groundMaterial = new THREE.LineBasicMaterial({
            color: 0x88a99d,
            transparent: true,
            opacity: 0.65,
          }),
          designMaterial = new THREE.LineBasicMaterial({ color: 0xdfb364 })
        ownedMaterials.push(groundMaterial, designMaterial)
        const paths = (points: XYZ[][], material: Three.LineBasicMaterial) => {
          const positions = roadWorkbenchLineSegments(points, first)
          if (!positions.length) return
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
          )
          ownedGeometry.push(geometry)
          scene.add(new THREE.LineSegments(geometry, material))
        }
        paths(data.groundPaths, groundMaterial)
        paths(data.formationPaths, designMaterial)
        if (data.deck.length) {
          const vertices = data.deck.flatMap((p) => {
            const q = local(p)
            return [q.x, q.y, q.z]
          })
          const g = new THREE.BufferGeometry()
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(vertices, 3),
          )
          g.computeVertexNormals()
          ownedGeometry.push(g)
          const m = new THREE.MeshStandardMaterial({
            color: 0xc49b58,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0,
          })
          ownedMaterials.push(m)
          scene.add(new THREE.Mesh(g, m))
          scene.add(new THREE.AmbientLight(0xffffff, 0.7))
          const light = new THREE.DirectionalLight(0xffffff, 1.5)
          light.position.set(1, 2, 1)
          scene.add(light)
        }
        const bounds = new THREE.Box3().setFromObject(scene),
          centre = bounds.getCenter(new THREE.Vector3()),
          size = bounds.getSize(new THREE.Vector3())
        const extent = Math.max(size.x, size.y, size.z, 1)
        if(terrain){
          const vertices=terrain.mesh.triangles.flatMap(face=>[face.a,face.b,face.c].flatMap(index=>{
            const point=terrain.mesh.points[index]
            if(!point)throw Error('Retained terrain face has an invalid vertex index.')
            return[point.x-first.easting,point.z-first.elevation,first.northing-point.y]
          }))
          const geometry=new THREE.BufferGeometry()
          geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
          const material=new THREE.MeshBasicMaterial({color:0x648e7b,transparent:true,opacity:0.28,side:THREE.DoubleSide})
          ownedGeometry.push(geometry);ownedMaterials.push(material)
          scene.add(new THREE.Mesh(geometry,material))
        }
        if (!Number.isFinite(extent) || bounds.isEmpty())
          throw Error('No complete 3D section geometry is available.')
        const radius = Math.max(
          bounds.getBoundingSphere(new THREE.Sphere()).radius,
          0.5,
        )
        const fit = () => {
          const vertical = (camera.fov * Math.PI) / 180,
            horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
          const distance =
            (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.08
          camera.position
            .copy(centre)
            .add(
              new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance),
            )
          camera.near = Math.max(0.01, distance / 10000)
          camera.far = Math.max(1000, distance + extent * 10)
          camera.updateProjectionMatrix()
          controls.target.copy(centre)
          controls.update()
        }
        fitView.current = fit
        const refresh = (ch: number) => {
          if (selectionLine) {
            selection.remove(selectionLine)
            selectionLine.geometry.dispose()
            selectionLine.material.dispose()
            selectionLine = null
          }
          const s = roadWorkbenchSection(model, ch)
          if (!s.worldFormation.length) return
          const g = new THREE.BufferGeometry().setFromPoints(
              s.worldFormation.map(local),
            ),
            m = new THREE.LineBasicMaterial({
              color: 0xf6f4ee,
              depthTest: false,
            })
          const line = new THREE.Line(g, m)
          line.renderOrder = 10
          selectionLine = line
          selection.add(line)
        }
        update.current = refresh
        refresh(selected.current)
        container.appendChild(renderer.domElement)
        const resize = () => {
          const width = Math.max(container.clientWidth, 1),
            height = Math.max(container.clientHeight, 1)
          renderer.setSize(width, height)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          fit()
        }
        observer = new ResizeObserver(resize)
        observer.observe(container)
        resize()
        const render = () => {
          if (cancelled) return
          controls.update()
          renderer.render(scene, camera)
          frame = requestAnimationFrame(render)
        }
        render()
        if (!cancelled) setLoading(false)
      } catch (failure) {
        cleanup()
        if (!cancelled) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'The 3D view could not be initialized.',
          )
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [model,terrain])
  return (
    <div aria-label="Road 3D view" className="relative min-w-0">
      <div ref={host} className="h-80 w-full overflow-hidden" />
      {(loading || error) && (
        <p
          role={error ? 'status' : undefined}
          className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-secondary)_95%,transparent)] p-6 text-center text-sm text-[var(--text-secondary)]"
        >
          {error || 'Loading 3D design…'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-color)] px-4 py-2">
        <button
          type="button"
          disabled={loading || !!error}
          onClick={() => fitView.current?.()}
          className="min-h-11 rounded border border-[var(--border-color)] px-3 text-xs disabled:opacity-40"
        >
          Fit 3D view
        </button>
        <p className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
          Drag to orbit · wheel to zoom · right-drag to pan. White: selected
          section. Design links are display geometry; {terrain?'terrain section areas are computed previews; whole-road terrain volumes are unassessed.':'quantities use measured section calculations.'}
        </p>
      </div>
    </div>
  )
}
