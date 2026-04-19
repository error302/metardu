# NVIDIA AI Live Testing Results

This artifact contains the live, unedited output from the NVIDIA NIM API (Llama-3.1-70b-instruct) for different survey data profiles.

## Cadastral Survey

> [!NOTE]
> **Input Data**:
> ```json
> {
>   "surveyType": "Cadastral Boundary Relocation",
>   "area": 2.5,
>   "distances": [
>     {
>       "from": "BM1",
>       "to": "BM2",
>       "distance": 50,
>       "bearing": "0°0'0\""
>     },
>     {
>       "from": "BM2",
>       "to": "BM3",
>       "distance": 100,
>       "bearing": "90°0'0\""
>     },
>     {
>       "from": "BM3",
>       "to": "BM4",
>       "distance": 49.95,
>       "bearing": "180°0'0\""
>     },
>     {
>       "from": "BM4",
>       "to": "BM1",
>       "distance": 100.05,
>       "bearing": "270°0'0\""
>     }
>   ]
> }
> ```

### AI Output 

**Survey Data Review Report**

**Survey Type:** Cadastral Boundary Relocation

**Findings:**

**1. Mathematical Inconsistencies (Closing Errors, Misclosures)**

* The survey data appears to be a closed traverse with four sides. To check for mathematical inconsistencies, we will calculate the internal angles and check for closure.
* The internal angles can be calculated as follows:
	+ Angle at BM1: 360° - (0° + 90° + 180° + 270°) = 270° - 270° = 0° ( checks out)
	+ Angle at BM2: 360° - (90° + 180° + 270° + 0°) = 90° - 90° = 0° ( checks out)
	+ Angle at BM3: 360° - (180° + 270° + 0° + 90°) = 180° - 180° = 0° ( checks out)
	+ Angle at BM4: 360° - (270° + 0° + 90° + 180°) = 270° - 270° = 0° ( checks out)
* The internal angles check out, indicating no mathematical inconsistencies.

However, we will check the closure of the traverse by calculating the difference between the sum of the opposite sides:

* Sum of opposite sides: (50m + 100.05m) = 150.05m and (100m + 49.95m) = 149.95m
* Closure error: 150.05m - 149.95m = 0.1m (0.067%)

The closure error is relatively small, but it may indicate a minor error in measurement or calculation.

**2. Outliers or Suspicious Values**

* The distance from BM1 to BM2 is 50m, which seems reasonable.
* The distance from BM2 to BM3 is 100m, which seems reasonable.
* The distance from BM3 to BM4 is 49.95m, which is very close to 50m. This could be a suspicious value, as it is unusual to have a measurement that is so close to a whole number.
* The distance from BM4 to BM1 is 100.05m, which seems reasonable.

The distance from BM3 to BM4 (49.95m) is a suspicious value and may require further investigation.

**3. Missing Data or Gaps**

* The survey data appears to be complete, with no missing data or gaps.

**4. Compliance with Standard Survey Accuracy Requirements**

* The survey accuracy requirements will depend on the jurisdiction and the specific standards applicable to cadastral boundary relocation surveys. However, as a general guideline, the International Organization for Standardization (ISO) recommends a maximum closure error of 1:10,000 for cadastral surveys.
* Based on the closure error calculated earlier (0.067%), the survey appears to meet the recommended standard.

**5. Recommendations for Improvement**

* Verify the measurement from BM3 to BM4 (49.95m) to ensure that it is accurate and not a transcription error.
* Consider recalculating the survey data to ensure that the closure error is minimized.
* Review the survey procedures and protocols to ensure that they meet the required standards and best practices.

In conclusion, the survey data appears to be generally accurate, but there are some minor inconsistencies and suspicious values that require further investigation.

---

## Engineering Survey (Set-out)

> [!NOTE]
> **Input Data**:
> ```json
> {
>   "surveyType": "Engineering Set-out",
>   "coordinates": [
>     {
>       "point": "COL1",
>       "easting": 1000.01,
>       "northing": 5000,
>       "elevation": 15
>     },
>     {
>       "point": "COL2",
>       "easting": 1005,
>       "northing": 5000,
>       "elevation": 15
>     },
>     {
>       "point": "COL3",
>       "easting": 1000,
>       "northing": 4995,
>       "elevation": 15
>     }
>   ]
> }
> ```

### AI Output 

**Survey Data Review Report**

**Survey Type:** Engineering Set-out
**Coordinates:**
- COL1: E:1000.01, N:5000, Z:15
- COL2: E:1005, N:5000, Z:15
- COL3: E:1000, N:4995, Z:15

**Findings:**

### 1. Mathematical Inconsistencies (Closing Errors, Misclosures)

* The coordinates form a triangle with COL1 and COL3 sharing the same Easting (1000) and COL1 and COL2 sharing the same Northing (5000).
* The difference in Easting between COL1 and COL2 is 4.99m (1005 - 1000.01), and the difference in Northing between COL1 and COL3 is 5m (5000 - 4995).
* Given the small differences, the data appears to be relatively consistent, but a more thorough analysis would require additional information about the survey's control points and the intended use of the set-out coordinates.

### 2. Outliers or Suspicious Values

* The Z-coordinate (elevation) is the same for all three points (Z:15). This could be a valid result, but it is worth verifying that the survey was conducted on a flat surface or that the elevation is correct for the site conditions.
* The Easting coordinate of COL1 has a more precise value (1000.01) compared to the other points, which may indicate a different measurement method or instrument was used for this point.

### 3. Missing Data or Gaps

* The provided data only includes three coordinates, which may not be sufficient for a comprehensive engineering set-out. Typically, more points would be required to define the layout of a project.
* There is no information provided about the control points used for the survey, which could impact the accuracy and reliability of the set-out coordinates.

### 4. Compliance with Standard Survey Accuracy Requirements

* Without additional information about the survey's control points, measurement methods, and intended use, it is difficult to assess compliance with standard survey accuracy requirements.
* However, based on the provided data, the differences between the coordinates appear to be relatively small, suggesting that the survey may meet some accuracy standards.

### 5. Recommendations for Improvement

* Provide more comprehensive data, including control points and additional set-out coordinates, to enable a thorough review of the survey's accuracy and reliability.
* Verify the Z-coordinate (elevation) values to ensure they are correct for the site conditions.
* Consider using a more consistent measurement method and precision for all points to ensure uniformity in the data.
* Provide additional information about the survey's control points, measurement methods, and intended use to enable a more thorough assessment of compliance with standard survey accuracy requirements.

---

## Sectional Property Survey

> [!NOTE]
> **Input Data**:
> ```json
> {
>   "surveyType": "Sectional Property Condominium",
>   "area": 0.015,
>   "distances": [
>     {
>       "from": "FLR1_WALL1",
>       "to": "FLR1_WALL2",
>       "distance": 12.5
>     },
>     {
>       "from": "FLR1_WALL2",
>       "to": "FLR1_WALL3",
>       "distance": 12
>     },
>     {
>       "from": "FLR1_WALL3",
>       "to": "FLR1_WALL4",
>       "distance": 12.5
>     },
>     {
>       "from": "FLR1_WALL4",
>       "to": "FLR1_WALL1",
>       "distance": 12
>     }
>   ]
> }
> ```

### AI Output 

**Survey Data Review Report**

**Survey Type:** Sectional Property Condominium

**Review Findings:**

### 1. Mathematical Inconsistencies (Closing Errors, Misclosures)

* The given distances form a closed loop (FLR1_WALL1 to FLR1_WALL2 to FLR1_WALL3 to FLR1_WALL4 to FLR1_WALL1).
* The calculated perimeter of the loop is: 12.5m + 12m + 12.5m + 12m = 49m.
* Since the loop is closed, the sum of the interior angles should be 360 degrees. However, without angle measurements, we cannot verify this.
* The calculated area is 0.015 hectares, which is approximately 150 square meters.
* To verify the area calculation, we can use the given distances to calculate the area using the formula for the area of a rectangle (length x width). However, the given distances do not form a rectangle (12.5m x 12m is not a rectangle).
* Assuming the distances form a trapezoid or an irregular quadrilateral, we would need more information (angles or additional distances) to accurately calculate the area.

**Conclusion:** There are mathematical inconsistencies due to the lack of angle measurements and unclear shape of the property.

### 2. Outliers or Suspicious Values

* The given distances seem reasonable for a sectional property condominium. However, without more context or information about the surrounding environment, it's difficult to identify any outliers or suspicious values.

**Conclusion:** No obvious outliers or suspicious values were found.

### 3. Missing Data or Gaps

* Angle measurements are missing, which would help to verify the calculated area and identify any mathematical inconsistencies.
* Information about the surrounding environment, such as adjacent properties or natural boundaries, is missing.
* It's unclear if there are any additional features or structures within the property that could affect the survey.

**Conclusion:** There are gaps in the data, specifically angle measurements and information about the surrounding environment.

### 4. Compliance with Standard Survey Accuracy Requirements

* The survey data does not provide information about the survey methods used, equipment, or precision levels achieved.
* Without this information, it's impossible to determine compliance with standard survey accuracy requirements.

**Conclusion:** Compliance with standard survey accuracy requirements cannot be determined.

### 5. Recommendations for Improvement

* Collect angle measurements to verify the calculated area and identify any mathematical inconsistencies.
* Provide information about the surrounding environment, such as adjacent properties or natural boundaries.
* Clarify the shape of the property (e.g., trapezoid, irregular quadrilateral) to accurately calculate the area.
* Include information about the survey methods used, equipment, and precision levels achieved to determine compliance with standard survey accuracy requirements.
* Consider using a more detailed survey method, such as a topographic survey, to capture additional features and structures within the property.

**Conclusion:** The survey data requires additional information and clarification to ensure accuracy and compliance with standard survey requirements.

---

