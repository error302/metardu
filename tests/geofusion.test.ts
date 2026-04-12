import { alignLayers, integrateLayers, uploadLayer, getCrossAnalysis } from '@/lib/compute/geofusion'

describe('GeoFusion Hub', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        alignment_id: 'align-123',
        status: 'completed',
        accuracy_score: 95.5,
        transformed_data: { type: 'FeatureCollection', features: [] }
      })
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('alignLayers', () => {
    test('aligns layers with affine transform', async () => {
      const result = await alignLayers({
        project_id: 'project-1',
        source_layer_id: 'layer-1',
        target_layer_id: 'layer-2',
        transform_type: 'affine',
        control_points: [
          { source: { x: 0, y: 0 }, target: { x: 1, y: 1 } },
          { source: { x: 100, y: 0 }, target: { x: 101, y: 1 } },
          { source: { x: 0, y: 100 }, target: { x: 1, y: 101 } }
        ]
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/geofusion/align'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('affine')
        })
      )

      expect(result.alignment_id).toBe('align-123')
      expect(result.accuracy_score).toBe(95.5)
    })

    test('aligns layers with similarity transform', async () => {
      const result = await alignLayers({
        project_id: 'project-1',
        source_layer_id: 'layer-1',
        transform_type: 'similarity'
      })

      expect(result.status).toBe('completed')
    })

    test('aligns layers with helmert transform', async () => {
      const result = await alignLayers({
        project_id: 'project-1',
        source_layer_id: 'layer-1',
        transform_type: 'helmert'
      })

      expect(result.status).toBe('completed')
    })

    test('throws error when alignment fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Transform failed' })
      }) as jest.Mock

      await expect(
        alignLayers({
          project_id: 'project-1',
          source_layer_id: 'layer-1',
          transform_type: 'affine'
        })
      ).rejects.toThrow('Failed to align layers')
    })
  })

  describe('integrateLayers', () => {
    test('integrates multiple layers with union strategy', async () => {
      const result = await integrateLayers({
        project_id: 'project-1',
        layer_ids: ['layer-1', 'layer-2', 'layer-3'],
        merge_strategy: 'union'
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/geofusion/integrate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('union')
        })
      )

      expect(result.layer_count).toBe(3)
    })

    test('integrates layers with intersection strategy', async () => {
      const result = await integrateLayers({
        project_id: 'project-1',
        layer_ids: ['layer-1', 'layer-2'],
        merge_strategy: 'intersection'
      })

      expect(result.layer_count).toBe(2)
    })

    test('integrates layers with overlay strategy', async () => {
      const result = await integrateLayers({
        project_id: 'project-1',
        layer_ids: ['layer-1', 'layer-2'],
        merge_strategy: 'overlay'
      })

      expect(result.layer_count).toBe(2)
    })
  })

  describe('uploadLayer', () => {
    test('uploads layer with file', async () => {
      const file = new File(['{"type": "FeatureCollection"}'], 'test.geojson', {
        type: 'application/json'
      })

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'layer-new',
          layer_name: 'test',
          layer_type: 'vector',
          visibility: true,
          opacity: 1
        })
      }) as jest.Mock

      const result = await uploadLayer({
        geofusion_project_id: 'project-1',
        layer_name: 'test',
        layer_type: 'vector',
        file
      })

      expect(fetch).toHaveBeenCalled()
      expect(result.id).toBe('layer-new')
    })

    test('uploads layer with GeoJSON data', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }
        ]
      }

      const result = await uploadLayer({
        geofusion_project_id: 'project-1',
        layer_name: 'points',
        layer_type: 'vector',
        geojson_data: geojson
      })

      expect(result.layer_name).toBe('points')
    })
  })

  describe('getCrossAnalysis', () => {
    test('performs overlay analysis', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: { intersections: 5 },
          summary: { total_features: 100 }
        })
      }) as jest.Mock

      const result = await getCrossAnalysis({
        project_id: 'project-1',
        layer_ids: ['layer-1', 'layer-2'],
        analysis_type: 'overlay'
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/geofusion/cross-analyze'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('overlay')
        })
      )

      expect(result.results).toBeDefined()
    })

    test('performs buffer analysis', async () => {
      const result = await getCrossAnalysis({
        project_id: 'project-1',
        layer_ids: ['layer-1'],
        analysis_type: 'buffer'
      })

      expect(result.results).toBeDefined()
    })

    test('performs distance analysis', async () => {
      const result = await getCrossAnalysis({
        project_id: 'project-1',
        layer_ids: ['layer-1', 'layer-2'],
        analysis_type: 'distance'
      })

      expect(result.results).toBeDefined()
    })

    test('throws error when analysis fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Analysis failed' })
      }) as jest.Mock

      await expect(
        getCrossAnalysis({
          project_id: 'project-1',
          layer_ids: ['layer-1', 'layer-2'],
          analysis_type: 'overlay'
        })
      ).rejects.toThrow('Failed to run cross analysis')
    })
  })
})
