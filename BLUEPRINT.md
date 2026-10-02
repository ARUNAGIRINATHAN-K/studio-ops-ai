# StudioOps Architectural Blueprint & Spatial Framework

## 1. Dimensional Authority & Coordinate System

- **World Origin**: `(0, 0, 0)` at ground center
- **Scale**: `1 unit = 1.0 meter`
- **Axes**:
  - `X`: Lateral width (West to East)
  - `Y`: Vertical elevation (Upwards)
  - `Z`: Longitudinal depth (South to North)
- **Building Boundary**:
  - `X`: `-16.5m` to `+16.5m` (total width: `33.0m`)
  - `Z`: `-12.5m` to `+12.5m` (total depth: `25.0m`)
- **Foundation**: `33.0m (W) × 0.48m (H) × 25.0m (D)` centered at `(0, -0.48, 0)`

---

## 2. Floor Levels & Vertical Elevations

| Level | Biome Name | Elevation Y | Storey Gap | Purpose / Character |
|:---:|:---|:---:|:---:|:---|
| **01** | **Focus Greenhouse** | `0.0m` | `4.4m` | Quiet work, bamboo pods, terrarium, perimeter planters, deep concentration |
| **02** | **AI Synthesis Oasis** | `4.4m` (slab `+2.4m` eff.) | `4.4m` | AI engineering, 8-seat developer islands, telemetry wall, tea pavilion |
| **03** | **Core Solarium** | `8.8m` (slab `+4.8m` eff.) | `4.4m` | 4 divisions (Leadership, Marketing, Engineering, Service), conference room, pantry |
| **04** | **Sunken Amphitheater** | `13.2m` (slab `+7.2m` eff.) | `Open` | Cedar rooftop deck, amphitheater, koi pond, pergola lounge, outdoor recreation |

---

## 3. Structural Elements vs. Removable Partitions

### Structural Elements (Immutable across all modes)
- Exterior building envelope and perimeter columns
- Foundation slab and intermediate floor slabs
- Stairwell core and circulation egress (`X ≈ -16.0m to -22.0m, Z ≈ 1.0m to 7.0m`)
- Service cores: Restrooms (`Level 1: (-14.5, 10.6)`, `Level 2: (-14.4, -10.55)`, `Level 3: (-14.45, -5.05)`, `Level 4: (14.55, 10.6)`)
- Pantry & plumbing chases

### Removable Partitions (Hidden in Open-Plan Mode)
- Non-loadbearing solid drywall partitions enclosing work zones
- Interior cubicle walls and separating baffles
- Partition walls dividing central team clusters

---

## 4. Open-Plan Zoning Framework

Every open-plan floor follows the unified zoning model:

```
+-------------------------------------------------------------+
|                      PERIMETER WINDOWS                      |
|                                                             |
|     WORKSTATION ISLAND A             WORKSTATION ISLAND B   |
|         (8-person)                       (8-person)         |
|                                                             |
|==================== CENTRAL WALKWAY (2.5m) =================|
|                                                             |
|     WORKSTATION ISLAND C             COLLABORATION / LOUNGE |
|         (8-person)                                          |
|                                                             |
| FOCUS ROOMS      GLASS CONFERENCE      PANTRY / RESTROOM    |
+-------------------------------------------------------------+
```

### Central Walkway Specification
- Continuous unobstructed central spine: `Z ≈ -1.25m to +1.25m` (width: `2.50m`)
- Unobstructed line-of-sight from East to West facade
- Architectural directional lighting and acoustic floor zoning

---

## 5. Level 01 — Focus Greenhouse
- **Acoustic Focus Pod**: `X = -8.0, Z = -4.0`
- **Central Moss Terrarium**: `X = 0.0, Z = 0.0`
- **Collaboration / Lounge**: `X = 8.0, Z = -4.0`
- **Perimeter Planter Troughs**: Along `Z = 11.5m` and `Z = -11.5m`

---

## 6. Level 02 — AI Synthesis Oasis
- **Tatami Tea Pavilion**: `X = -6.0, Z = -2.0`
- **Agent Workstations**: `X = 6.0, Z = 4.0`
- **Telemetry Display Wall**: `Z = -11.86m`, four 5.5m × 1.35m displays at `X = -12.0, -4.0, +4.0, +12.0`
- **Developer Benching**: Dual-monitor islands with mechanical keyboards and cable spines

---

## 7. Level 03 — Core Solarium
- **Leadership / Executive Suite**: `X = -5.5, Z = -3.5`
- **Marketing & Business Cluster**: `X = 5.5, Z = -3.5`
- **Engineering & Design Cluster**: `X = -5.5, Z = 6.5`
- **Customer Service & Operations**: `X = 5.5, Z = 6.5`
- **Glass Meeting Room**: `X = -12.9, Z = -9.25`
- **Phone Booths**: `X = -14.6, -12.4, Z = 10.5`
- **Moss Pantry & Lounge**: `X = 11.8, Z = -10.3`
- **Restroom**: `X = -14.45, Z = -5.05`

---

## 8. Level 04 — Sunken Amphitheater Rooftop
- **Stepped Amphitheater**: Tiered cedar seating with presentation stage
- **Reflective Koi Pond**: `X = 3.0, Z = 9.0` with floating slate stepping stones
- **Timber Pergola Canopy**: `X = -6.0, Z = -6.5` with lounge sofa and lanterns
- **Recreation**: Billiards (`X = -6.0, Z = 6.0`), Ping Pong (`X = 6.0, Z = -5.5`), Chess table (`X = 11.2, Z = -1.3`), Yoga meadow

---

## 9. Material Tokens & Visual Styling

- **White Architectural Walls**: `#F7F7F5` (smooth matte finish, 1px walnut vertical trim)
- **Walnut Desktops & Wood Furniture**: `#4A2F20` (warm walnut grain, satin polyurethane)
- **Dark Espresso Wood & Cabinets**: `#241914`
- **Light Stone / Marble Flooring**: `#D8D5CE` (procedural tile grid, specular highlights)
- **Black Ergonomic Chairs**: `#111111` (contoured mesh back, star base, casters)
- **Glass Partitions**: Subtle transparent tint (`#d6e8e8`, opacity `0.30`, dark charcoal frames `#262626`)
- **Indoor Greenery**: `#3F6B45` (Monstera, Ficus, Sansevieria in terracotta/stone planters)
- **Display Screens**: Emissive active telemetry `#BBDFFF` (emissive intensity `0.45`)
- **Accent Blue**: `#2563EB`

---

## 10. Partition Semantic Registry & Layout Mode Specification

All walls and interior partitions are classified into semantic categories:
- `STRUCTURAL`: Core perimeter columns, floor slabs, stair egress, and service cores (immutable across all modes)
- `PARTITION`: Solid non-loadbearing dividing drywall (active only in `ORIGINAL` mode)
- `GLASS_PARTITION`: STC-42 acoustic glass demountable systems with dark frames (active in `OPEN_PLAN` mode)
- `SERVICE_CORE`: Permanent restroom envelopes and vertical chases
- `DECORATIVE`: Acoustic slatted felt panels and biophilic planter spines

### Layout Mode Runtime State
The global layout state is controlled via:
- `window.officeScene.setLayoutMode('OPEN_PLAN' | 'ORIGINAL')`
- `window.officeScene.getLayoutMode()` returns the active mode string
- `window.officeScene.getPartitionRegistry()` returns the partition metadata table:
```json
{
  "id": "L3-Conf-Front",
  "type": "GLASS_PARTITION",
  "removable": true,
  "floor": 3,
  "position": [-12.9, 0, -6.5],
  "size": [6.0, 2.4, 0.06],
  "material": "Low-Iron Acoustic Glass with Matte Charcoal Frames"
}
```

---

## 11. Interactive Inspection & Camera System

### Raycasting & Selection Feedback
- Interactive picking raycasts both team avatars and inspectable architectural entities.
- Selecting an entity wraps it in a real-time cyan bounding box (`THREE.BoxHelper`) and opens the `#object-inspector` panel.
- Supported inspection categories: `WORKSTATION_ISLAND`, `GLASS_PARTITION`, `CONFERENCE`, `PHONE_BOOTH`, `PANTRY`, `LOUNGE`, `AMPHITHEATER`, `KOI_POND`, `RECREATION`, `TELEMETRY_SCREEN`, and `GREENERY`.

### Camera Presets
- `Orbit`: Standard isometric orbital track around the active biome.
- `Isometric`: Classical elevated axonometric projection (`θ = -π/4, φ = π/3.2`).
- `Walkway`: Longitudinal human eye-level view along the 2.5m central walkway spine (`Y = +1.25m`).
- `2D Map`: Zenithal top-down plan view (`φ ≈ 0`).
