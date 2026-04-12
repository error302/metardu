-- Benchmarks Table
CREATE TABLE benchmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bm_number text UNIQUE NOT NULL,
  name text,
  county text,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  elevation float8 NOT NULL,
  datum text DEFAULT 'MSL_MOMBASA',
  mark_type text,
  description text,
  established date,
  last_verified date,
  status text DEFAULT 'ACTIVE',
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_benchmarks_county ON benchmarks(county);
CREATE INDEX idx_benchmarks_status ON benchmarks(status);

ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;

-- Public read access to benchmarks
CREATE POLICY "Anyone can read benchmarks" ON benchmarks
  FOR SELECT USING (true);

-- Seed data with Kenya benchmarks
INSERT INTO benchmarks (bm_number, name, county, latitude, longitude, elevation, mark_type, description, status, source) VALUES
-- Nairobi County
('BM-NBI-001', 'Nairobi GPO', 'Nairobi', -1.2833, 36.8167, 1661.234, 'FLUSH_BRACKET', 'Flush bracket on south face of GPO building, Tom Mboya Street', 'ACTIVE', 'Survey of Kenya 2018'),
('BM-NBI-002', 'Uhuru Park', 'Nairobi', -1.2892, 36.8150, 1674.112, 'RIVET', 'Rivet in concrete kerb at Uhuru Park main entrance', 'ACTIVE', 'Survey of Kenya 2018'),
('BM-NBI-003', 'Kenyatta Avenue', 'Nairobi', -1.2845, 36.8234, 1679.445, 'FLUSH_BRACKET', 'Flush bracket on Kenyatta Avenue post office', 'ACTIVE', 'Survey of Kenya 2019'),
('BM-NBI-004', 'Westlands', 'Nairobi', -1.2645, 36.8012, 1682.112, 'PILLAR', 'Concrete pillar at Westlands Roundabout', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-NBI-005', 'Karen', 'Nairobi', -1.3156, 36.7845, 1812.334, 'RIVET', 'Rivet in concrete at Karen shopping centre', 'ACTIVE', 'Survey of Kenya 2020'),

-- Mombasa County
('BM-MSA-001', 'Mombasa Station', 'Mombasa', -4.0435, 39.6682, 17.445, 'FLUSH_BRACKET', 'Flush bracket on Mombasa Railway Station north wall', 'ACTIVE', 'Survey of Kenya 2015'),
('BM-MSA-002', 'Mombasa Port', 'Mombasa', -4.0621, 39.6923, 12.334, 'PILLAR', 'Concrete pillar at Port entrance gate', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-MSA-003', 'Nyali', 'Mombasa', -3.9856, 39.7234, 28.112, 'RIVET', 'Rivet in concrete at Nyali Bridge', 'ACTIVE', 'Survey of Kenya 2018'),

-- Kisumu County
('BM-KSM-001', 'Kisumu Port', 'Kisumu', -0.0917, 34.7680, 1134.891, 'PILLAR', 'Concrete pillar at Kisumu Port entrance', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-KSM-002', 'Kisumu Airport', 'Kisumu', -0.0865, 34.7289, 1145.223, 'FLUSH_BRACKET', 'Flush bracket on Kisumu Airport terminal building', 'ACTIVE', 'Survey of Kenya 2019'),

-- Nakuru County
('BM-NKR-001', 'Nakuru Town', 'Nakuru', -0.3031, 36.0800, 1861.203, 'FLUSH_BRACKET', 'Flush bracket on Nakuru Municipal Council building', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-NKR-002', 'Nakuru Airport', 'Nakuru', -0.3145, 36.0234, 1902.445, 'PILLAR', 'Concrete pillar at Nakuru Aerodrome', 'ACTIVE', 'Survey of Kenya 2018'),

-- Eldoret (Uasin Gishu)
('BM-ELD-001', 'Eldoret Town', 'Uasin Gishu', 0.5143, 35.2698, 2098.112, 'FLUSH_BRACKET', 'Flush bracket on Eldoret Town Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-ELD-002', 'Eldoret Airport', 'Uasin Gishu', 0.5234, 35.2423, 2134.556, 'PILLAR', 'Concrete pillar at Eldoret Airport', 'ACTIVE', 'Survey of Kenya 2019'),

-- Nyeri County
('BM-NYR-001', 'Nyeri Town', 'Nyeri', -0.4196, 36.9553, 1756.234, 'FLUSH_BRACKET', 'Flush bracket on Nyeri County Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-NYR-002', 'Mwea', 'Nyeri', -0.6234, 37.2567, 1256.112, 'RIVET', 'Rivet at Mwea irrigation gate', 'ACTIVE', 'Survey of Kenya 2020'),

-- Machakos County
('BM-MKS-001', 'Machakos Town', 'Machakos', -1.5176, 37.2634, 1623.445, 'FLUSH_BRACKET', 'Flush bracket on Machakos Town Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-MKS-002', 'Matuu', 'Machakos', -1.4267, 37.5212, 1056.223, 'PILLAR', 'Concrete pillar at Matuu Market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Kiambu County
('BM-KBU-001', 'Thika Town', 'Kiambu', -1.0334, 37.0692, 1456.112, 'FLUSH_BRACKET', 'Flush bracket on Thika Municipal Building', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-KBU-002', 'Ruiru', 'Kiambu', -1.1489, 36.9612, 1534.556, 'RIVET', 'Rivet at Ruiru Junction', 'ACTIVE', 'Survey of Kenya 2018'),

-- Kajiado County
('BM-KAJ-001', 'Kajiado Town', 'Kajiado', -1.8512, 36.7823, 1823.445, 'FLUSH_BRACKET', 'Flush bracket on Kajiado Chief''s Office', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-KAJ-002', 'Kiserian', 'Kajiado', -1.5623, 36.8912, 1923.112, 'RIVET', 'Rivet at Kiserian trading centre', 'ACTIVE', 'Survey of Kenya 2020'),

-- Meru County
('BM-MRU-001', 'Meru Town', 'Meru', 0.0478, 37.6498, 1556.334, 'FLUSH_BRACKET', 'Flush bracket on Meru Municipal Building', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-MRU-002', 'Mitunguu', 'Meru', 0.1234, 37.8912, 1345.223, 'PILLAR', 'Concrete pillar at Mitunguu market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Kitui County
('BM-KTI-001', 'Kitui Town', 'Kitui', -1.3715, 38.0106, 1156.445, 'FLUSH_BRACKET', 'Flush bracket on Kitui County Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-KTI-002', 'Mwingi', 'Kitui', -0.8934, 38.0712, 856.223, 'RIVET', 'Rivet at Mwingi market', 'ACTIVE', 'Survey of Kenya 2018'),

-- Embu County
('BM-EMB-001', 'Embu Town', 'Embu', -0.5389, 37.4589, 1290.112, 'FLUSH_BRACKET', 'Flush bracket on Embu Municipal Building', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-EMB-002', 'Manyatta', 'Embu', -0.5612, 37.5234, 1345.556, 'PILLAR', 'Concrete pillar at Manyatta market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Kericho County
('BM-KRN-001', 'Kericho Town', 'Kericho', -0.3689, 35.3212, 1980.223, 'FLUSH_BRACKET', 'Flush bracket on Kericho Municipal Building', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-KRN-002', 'Litein', 'Kericho', -0.6234, 35.2456, 2012.445, 'RIVET', 'Rivet at Litein market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Bomet County
('BM-BMT-001', 'Bomet Town', 'Bomet', -0.7867, 35.3412, 1956.334, 'FLUSH_BRACKET', 'Flush bracket on Bomet County Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-BMT-002', 'Sotik', 'Bomet', -0.6856, 35.1234, 1876.112, 'PILLAR', 'Concrete pillar at Sotik market', 'ACTIVE', 'Survey of Kenya 2020'),

-- Kakamega County
('BM-KAK-001', 'Kakamega Town', 'Kakamega', 0.2827, 34.7518, 1534.556, 'FLUSH_BRACKET', 'Flush bracket on Kakamega County Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-KAK-002', 'Mumias', 'Kakamega', 0.3312, 34.4912, 1234.223, 'RIVET', 'Rivet at Mumias market', 'ACTIVE', 'Survey of Kenya 2018'),

-- Bungoma County
('BM-BNG-001', 'Bungoma Town', 'Bungoma', 0.5634, 34.5606, 1423.445, 'FLUSH_BRACKET', 'Flush bracket on Bungoma County Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-BNG-002', 'Webuye', 'Bungoma', 0.5623, 34.7812, 1567.112, 'PILLAR', 'Concrete pillar at Webuye market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Busia County
('BM-BUS-001', 'Busia Town', 'Busia', 0.4634, 34.1112, 1156.223, 'FLUSH_BRACKET', 'Flush bracket on Busia Town Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-BUS-002', 'Siaya', 'Siaya', 0.0612, 34.2812, 1290.445, 'RIVET', 'Rivet at Siaya market', 'ACTIVE', 'Survey of Kenya 2018'),

-- Homa Bay County
('BM-HMB-001', 'Homa Bay Town', 'Homa Bay', -0.5273, 34.4571, 1089.334, 'FLUSH_BRACKET', 'Flush bracket on Homa Bay County Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-HMB-002', 'Migori', 'Migori', -1.0634, 34.4731, 1176.556, 'PILLAR', 'Concrete pillar at Migori town centre', 'ACTIVE', 'Survey of Kenya 2019'),

-- Kisii County
('BM-KIS-001', 'Kisii Town', 'Kisii', -0.6817, 34.7660, 1718.223, 'FLUSH_BRACKET', 'Flush bracket on Kisii County Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-KIS-002', 'Nyamira', 'Kisii', -0.5612, 34.9523, 1890.445, 'RIVET', 'Rivet at Nyamira market', 'ACTIVE', 'Survey of Kenya 2019'),

-- Marsabit County
('BM-MRS-001', 'Marsabit Town', 'Marsabit', 2.3345, 37.9892, 1102.112, 'FLUSH_BRACKET', 'Flush bracket on Marsabit County Hall', 'ACTIVE', 'Survey of Kenya 2017'),
('BM-MRS-002', 'Moyale', 'Marsabit', 3.5212, 39.0523, 1056.334, 'PILLAR', 'Concrete pillar at Moyale border', 'ACTIVE', 'Survey of Kenya 2020'),

-- Isiolo County
('BM-ISI-001', 'Isiolo Town', 'Isiolo', 0.3545, 37.5823, 1098.445, 'FLUSH_BRACKET', 'Flush bracket on Isiolo County Hall', 'ACTIVE', 'Survey of Kenya 2016'),
('BM-ISI-002', 'Meru', 'Isiolo', 0.0478, 37.6498, 1556.223, 'RIVET', 'Rivet at Merti trading centre', 'ACTIVE', 'Survey of Kenya 2019');
