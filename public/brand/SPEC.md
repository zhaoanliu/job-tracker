# ApplyTrackr Logo Spec

## Colors
| Token | Hex | Usage |
|---|---|---|
| Indigo 600 | `#4f46e5` | Icon background, primary CTA |
| Indigo 900 | `#312e81` | "Apply" wordmark on light |
| Indigo 500 | `#6366f1` | "Trackr" wordmark on light |
| White | `#ffffff` | "Apply" wordmark on dark |
| Indigo 400 | `#818cf8` | "Trackr" wordmark on dark |

## Typography
- **Apply** — Inter, weight 600 (semibold)
- **Trackr** — Inter, weight 400 (regular)

## Files
| File | Use |
|---|---|
| `icon-mark.svg` | App icon, 120×120, all sizes via CSS |
| `icon-mark-32.svg` | Optimised 32px version |
| `favicon.svg` | `<link rel="icon">` in `<head>` |
| `lockup-light.svg` | Nav bar on light backgrounds |
| `lockup-dark.svg` | Nav bar on dark backgrounds |
| `og-image.svg` | Open Graph / social sharing |

## Corner radius
Scale with icon size: `rx ≈ 20% of width`
- 16px → rx 3
- 32px → rx 7
- 48px → rx 11
- 120px → rx 24

## Clearspace
Maintain padding equal to 10% of icon width on all sides.
