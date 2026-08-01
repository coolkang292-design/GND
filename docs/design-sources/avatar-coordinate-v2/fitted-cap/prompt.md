# GND fitted cap reference v1

## Execution

- Mode: built-in `image_gen` edit
- Final generated source: `C:\Users\SAMSUNG\.codex\generated_images\019fbee0-d205-7342-9707-4d49753a5c0e\exec-69bf29ab-dc5d-47d2-9da4-1d84039434df.png`
- Final generated source SHA256: `24ea7aa773b2cf66dd761159b8e5f49d4fff4a1ee949991f25fe216f6775ad3f`
- Project output: `docs/design-sources/avatar-coordinate-v2/fitted-cap/gnd-cap-fitted-reference-v1.png`
- Canvas: 1024 x 1536 RGBA
- Alpha restoration: generated flat chroma-key background removed with the installed ImageGen helper (`--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 96 --despill`)
- Size normalization: the built-in source was 1023 x 1537; preserve its pixels by adding one transparent column at right and removing one transparent bottom row to produce the canonical 1024 x 1536 canvas.

## Input roles

- Image 1 — edit target: `public/avatar-coordinate-v2/base/avatar-base-master.png`
- Image 2 — geometry/style reference only: `docs/design-sources/avatar-coordinate-v2/fitted-cap/gnd-cap-natural-wear-reference.jpg`
- Image 2 content other than the cap fit was explicitly excluded.

## Provenance

- Preserved geometry/style reference: `docs/design-sources/avatar-coordinate-v2/fitted-cap/gnd-cap-natural-wear-reference.jpg`
- Preserved reference SHA256: `62ecc3105fd7f67d747a5c8156f5f00f3f95475d57fa5dbf1a5c157196a303d0`
- Original external source: `C:\Users\SAMSUNG\.codex\codex-remote-attachments\019fbbfe-f0c7-7b53-aa25-4dc753ec7b79\E03241D7-10A5-4232-9D2B-DCE0A5662E10\1-사진-1.jpg`
- Generated source PNG: `C:\Users\SAMSUNG\.codex\generated_images\019fbee0-d205-7342-9707-4d49753a5c0e\exec-69bf29ab-dc5d-47d2-9da4-1d84039434df.png`
- Generated source PNG SHA256: `24ea7aa773b2cf66dd761159b8e5f49d4fff4a1ee949991f25fe216f6775ad3f`

## Exact final prompt

```text
Use case: identity-preserve
Asset type: fitted avatar-cap reference for later layer extraction
Input images: Image 1: edit target, the canonical bulldog avatar; Image 2: geometry/style reference only for how a black baseball cap fits a bulldog head.
Targeted correction after rejected attempt: perform a tightly localized edit and pixel-lock Image 1 outside the cap/forehead contact area. Do not redraw, reinterpret, rescale, recolor, sharpen, or move the bulldog, face, body, clothing, or pose. The prior output was rejected because it baked a checkerboard into the pixels and changed the original body.
Primary request: Edit Image 1 only. Add one naturally fitted black curved baseball cap with a single centered white capital letter "G" on the front panel.
Scene/backdrop: For reliable alpha restoration, replace only the transparent backdrop with a perfectly flat solid #00ff00 chroma-key background. It must be one uniform #00ff00 color with no checkerboard, shadows, gradients, texture, reflections, floor plane, lighting variation, or green inside the subject. Keep the subject fully separated from the background with crisp edges.
Subject: Keep the exact bulldog pixels from Image 1 wherever they are not physically covered by the cap. The cap must follow the skull curvature and camera angle. Place the curved brim above both eyes so it never crosses either pupil. Preserve physically correct front/back occlusion between the cap and both ears; allow only the minimal ear occlusion caused by a real fitted cap. Add a subtle realistic contact shadow only where the cap touches the forehead and temples.
Style/medium: Match Image 1's photorealistic character rendering, materials, sharpness, lighting, and color.
Composition/framing: Preserve the exact 1024 x 1536 portrait canvas, full-body placement, scale, crop, and pose from Image 1.
Text (verbatim): "G"
Constraints: Change only the fitted cap, its physically necessary local occlusion/contact shadow, and the transparent backdrop to flat #00ff00 for later removal. Preserve the exact face identity, both eyes, pupils, brows, muzzle, nose, mouth, facial expression, ears except physically correct partial cap occlusion, head proportions, fur markings and texture, body, muscles, arms, hands, legs, feet, pose, black tank top, black shorts, lighting, and framing from Image 1. Render the white capital G exactly once, centered on the cap front. Use Image 2 only as a geometry/style reference; do not copy any other content from it.
Avoid: any checkerboard pattern; glasses, sunglasses, hoodie, shoes, watch, jewelry, extra accessories, extra clothing, background scene, car, UI, badges, watermarks, logos, or any text other than the single white "G". No brim over the pupils. No floating cap, oversized cap, flat pasted-on cap, impossible ear layering, altered face, altered body, or altered clothing.
```

## Invariants

- Keep the canonical 1024 x 1536 framing and transparent canvas state.
- Add only a fitted black curved cap and one centered white capital `G`.
- Keep both pupils fully visible below the brim.
- Preserve natural ear/cap front-back occlusion and a subtle forehead/temple contact shadow.
- Preserve the bulldog identity, face, body, pose, tank top, shorts, lighting, and placement.
- Do not introduce glasses, hoodie, shoes, watch, other accessories, background, car, UI, badges, watermark, logo, or extra text.
- Never overwrite `public/avatar-coordinate-v2/base/avatar-base-master.png`.

## Inspection notes

- Rejected attempt 1: `exec-11707734-6616-4cac-b0a2-db03f4ea626a.png`. The cap geometry was usable, but the output was RGB with a checkerboard baked into the pixels and showed broad pixel drift outside the requested edit.
- Chosen attempt 2: crown curvature and camera angle fit the skull; the brim stays above both pupils; both ears remain visible with plausible side occlusion; the contact shadow is subtle; the centered `G` appears once; no excluded accessory or scene element appears.
- Alpha inspection: RGBA output, all four corner alpha values are 0, and no opaque chroma-key green remains.
- Known concern: the generated bulldog remains visually identity-consistent, but it is not pixel-identical to the canonical base outside the cap. This reference must be used for fitted-cap geometry only. Production layer extraction must composite the separated cap layers over the unchanged canonical base and restore original base ear pixels where needed; this image must not replace the base avatar.
