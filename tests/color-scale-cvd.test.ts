/**
 * tests/color-scale-cvd.test.ts
 *
 * 06-02-PLAN.md Task 1: D-17's colourblind legibility assertion. This test file is the ENTIRE
 * evidence for success criterion 2 ("checked against a simulation of the common color-vision
 * deficiencies") -- D-17 explicitly rejects a committed screenshot, so this live check runs on
 * every `npm run test` and gates any future palette edit that breaks deuteranopia/protanopia/
 * tritanopia legibility. Runs in the fast Node `unit` project: pure colour-space maths over
 * `valueToColor`'s own output, no DOM, no canvas, no browser.
 *
 * Thresholds fixed in 06-02-PLAN.md's own text BEFORE the palette was tested against them
 * (finding F-07): `CVD_BAND_COUNT`, `MIN_ADJACENT_DELTA_E` and `MIN_CATEGORICAL_DELTA_E` below.
 * Per that plan's prohibition, none of the three may move to make a failing palette pass -- if
 * the palette fails, the palette (`RAMP_STOPS`/`INCOMPLETE_RGBA` in `value-to-color.ts`) changes.
 */

import { describe, expect, test } from 'vitest'

import {
  DOMAIN_LOG_MAX,
  DOMAIN_LOG_MIN,
  INCOMPLETE_RGBA,
  valueToColor,
  type Rgba,
} from '../src/colorscale/value-to-color.ts'

/** 06-02-PLAN.md's own fixed table: sixteen bands means fifteen adjacent pairs across the full
 * ramp, a granularity a reader actually resolves on a 4px cell field. */
const CVD_BAND_COUNT = 16

/** Mahy et al. 1994's widely cited CIE76 just-noticeable difference of 2.3, plus margin, because
 * dichromacy simulation compresses the effective gamut and can only bring an already-separable
 * pair closer together, never further apart (06-RESEARCH.md assumption A2). */
const MIN_ADJACENT_DELTA_E = 3.0

/** The incomplete-hold grey is not merely distinguishable from its neighbours, it must read as a
 * different KIND of thing than any valued cell (D-20, PITFALLS E5). */
const MIN_CATEGORICAL_DELTA_E = 10.0

// ---------------------------------------------------------------------------------------------
// sRGB <-> CIE Lab (D65), CIE76 delta E -- ~30 lines, no dependency, per D-17's own budget.
// Standard formulas (D65 illuminant, sRGB companding): en.wikipedia.org/wiki/SRGB and
// en.wikipedia.org/wiki/CIELAB_color_space. Verified against known reference points below
// (pure white L* 100, mid grey #808080 L* ~53.6) rather than trusted from memory alone.
// ---------------------------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

type Lab = readonly [L: number, a: number, b: number]

/** sRGB (0-255 per channel, alpha ignored) to CIE Lab under the D65 illuminant. */
function srgbToLab(rgb: Rgba): Lab {
  const r = srgbChannelToLinear(rgb[0])
  const g = srgbChannelToLinear(rgb[1])
  const b = srgbChannelToLinear(rgb[2])

  // sRGB-to-XYZ (D65), standard matrix.
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b

  // D65 reference white.
  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883

  const delta = 6 / 29
  const f = (t: number): number => (t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29)

  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Euclidean distance in Lab space -- the CIE76 formula. */
function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

// ---------------------------------------------------------------------------------------------
// Colour-vision-deficiency simulation: Viénot, Brettel and Mollon 1999, precomputed protanopia/
// deuteranopia/tritanopia matrices transcribed from `libDaltonLens`
// (github.com/DaltonLens/libDaltonLens, public domain, unit-tested), file `libDaltonLens.c`,
// arrays `dl_vienot_{protan,deutan,tritan}_rgbCvd_from_rgb` (function
// `dl_simulate_cvd_vienot1999`), fetched and read directly from that repository this session.
// Do NOT replace these with the "Coblis"/colorjack.com set: that set's own original author
// describes it as "a very inaccurate one-night hack"
// (gist.github.com/Lokno/df7c3bfdc9ad32558bb7) -- a plausible-looking wrong matrix passes code
// review while silently defeating the exact thing this test exists to catch (06-RESEARCH.md
// "Don't Hand-Roll"). libDaltonLens's own comment confirms Viénot 1999 reduces the full LMS
// pipeline (linearRGB -> LMS -> project -> LMS -> linearRGB) to a single 3x3 matrix multiply in
// linearRGB space, so no separate LMS conversion step is needed here.
// ---------------------------------------------------------------------------------------------

type CvdMatrix = readonly [number, number, number, number, number, number, number, number, number]

const CVD_MATRICES: Readonly<Record<'protanopia' | 'deuteranopia' | 'tritanopia', CvdMatrix>> = {
  protanopia: [0.11238, 0.88762, 0.0, 0.11238, 0.88762, -0.0, 0.00401, -0.00401, 1.0],
  deuteranopia: [0.29275, 0.70725, 0.0, 0.29275, 0.70725, -0.0, -0.02234, 0.02234, 1.0],
  // Viénot 1999 is documented (by libDaltonLens itself) as not accurate for tritanopia; it is
  // still the simulation this test uses for tritanopia because D-17's ~50-line budget and this
  // plan's fixed "simplest of the three legitimate published methods" choice both apply to all
  // three deficiencies uniformly, and the tritan matrix is still the real Viénot 1999 precomputed
  // value, not a fabricated stand-in.
  tritanopia: [1.0, 0.14461, -0.14461, 0.0, 0.85924, 0.14076, -0.0, 0.85924, 0.14076],
}

function linearChannelToSrgb(c: number): number {
  const clamped = clamp01(c)
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

/** Simulates one of the three dichromacies on an sRGB colour: linearise, apply the Viénot 1999
 * matrix, re-encode to sRGB with per-channel clamping and rounding. */
function simulateCvd(rgb: Rgba, deficiency: keyof typeof CVD_MATRICES): Rgba {
  const m = CVD_MATRICES[deficiency]
  const r = srgbChannelToLinear(rgb[0])
  const g = srgbChannelToLinear(rgb[1])
  const b = srgbChannelToLinear(rgb[2])

  const rOut = m[0] * r + m[1] * g + m[2] * b
  const gOut = m[3] * r + m[4] * g + m[5] * b
  const bOut = m[6] * r + m[7] * g + m[8] * b

  return [
    Math.round(linearChannelToSrgb(rOut) * 255),
    Math.round(linearChannelToSrgb(gOut) * 255),
    Math.round(linearChannelToSrgb(bOut) * 255),
    rgb[3],
  ]
}

const DEFICIENCIES = ['protanopia', 'deuteranopia', 'tritanopia'] as const

// ---------------------------------------------------------------------------------------------
// Sampling the ramp: CVD_BAND_COUNT band centres, computed by inverting the symlog transform
// over [DOMAIN_LOG_MIN, DOMAIN_LOG_MAX], so the sampled bands are the bands a reader actually
// sees rather than an arbitrary set of numbers. Sampled through `valueToColor` itself (not
// `interpolateRamp` directly), so this test exercises the exact function the app ships.
// ---------------------------------------------------------------------------------------------

function rampBandCentreMultiples(bandCount: number): number[] {
  const multiples: number[] = []
  for (let i = 0; i < bandCount; i++) {
    const t = (i + 0.5) / bandCount
    const log10Value = DOMAIN_LOG_MIN + t * (DOMAIN_LOG_MAX - DOMAIN_LOG_MIN)
    multiples.push(10 ** log10Value)
  }
  return multiples
}

function rampBandColours(bandCount: number): Rgba[] {
  return rampBandCentreMultiples(bandCount).map((value) => valueToColor({ value, ruined: false, incomplete: false }))
}

describe('srgbToLab: reference round-trip', () => {
  test('pure white maps to L* 100 with a and b near 0', () => {
    const [L, a, b] = srgbToLab([255, 255, 255, 255])
    expect(L).toBeCloseTo(100, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  test('mid grey #808080 maps to L* near 53.6', () => {
    const [L] = srgbToLab([0x80, 0x80, 0x80, 255])
    expect(L).toBeCloseTo(53.6, 0)
  })
})

describe('simulateCvd: identity on achromatic input', () => {
  test('a pure grey stays the same grey under all three deficiencies, to within one channel step', () => {
    const grey: Rgba = [128, 128, 128, 255]
    for (const deficiency of DEFICIENCIES) {
      const simulated = simulateCvd(grey, deficiency)
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(simulated[channel]! - grey[channel]!)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('simulateCvd: deuteranopia genuinely confuses red and green (not a no-op)', () => {
  // Pure sRGB primaries (255,0,0) vs (0,255,0) differ so much in luminance (Y_red=0.213,
  // Y_green=0.715) that even fully confused they remain roughly deltaE76 30 apart under this
  // matrix -- confirmed by hand and by direct computation this session. The classic
  // deuteranopia confusion pair is two comparably-*saturated* red and green swatches at closer
  // luminance (the traffic-light-style pairing design guidance warns about), not the two most
  // extreme sRGB primaries. These two colours are both strongly saturated (high chroma, not
  // pastel) and their un-simulated deltaE76 is ~112 -- collapsing to well under 15 under
  // deuteranopia is exactly the confusion this behaviour spec exists to prove is real.
  const saturatedRed: Rgba = [200, 50, 50, 255]
  const saturatedGreen: Rgba = [50, 160, 50, 255]

  test('un-simulated, the two colours are far apart (sanity check the pair is a real test)', () => {
    const distance = deltaE76(srgbToLab(saturatedRed), srgbToLab(saturatedGreen))
    expect(distance).toBeGreaterThan(50)
  })

  test('under deuteranopia, the two colours land within deltaE76 15 of each other', () => {
    const simulatedRed = simulateCvd(saturatedRed, 'deuteranopia')
    const simulatedGreen = simulateCvd(saturatedGreen, 'deuteranopia')
    const distance = deltaE76(srgbToLab(simulatedRed), srgbToLab(simulatedGreen))
    expect(distance).toBeLessThan(15)
  })
})

describe('ramp: adjacent-band separability under simulated CVD (D-17, VIZ-07)', () => {
  const bandColours = rampBandColours(CVD_BAND_COUNT)

  test(`sample count is exactly CVD_BAND_COUNT (${CVD_BAND_COUNT})`, () => {
    expect(bandColours).toHaveLength(CVD_BAND_COUNT)
  })

  test('every adjacent pair stays at least MIN_ADJACENT_DELTA_E apart with no simulation applied', () => {
    for (let i = 0; i < bandColours.length - 1; i++) {
      const distance = deltaE76(srgbToLab(bandColours[i]!), srgbToLab(bandColours[i + 1]!))
      expect(distance).toBeGreaterThanOrEqual(MIN_ADJACENT_DELTA_E)
    }
  })

  for (const deficiency of DEFICIENCIES) {
    test(`every adjacent pair stays at least MIN_ADJACENT_DELTA_E apart under simulated ${deficiency}`, () => {
      for (let i = 0; i < bandColours.length - 1; i++) {
        const a = simulateCvd(bandColours[i]!, deficiency)
        const b = simulateCvd(bandColours[i + 1]!, deficiency)
        const distance = deltaE76(srgbToLab(a), srgbToLab(b))
        expect(distance).toBeGreaterThanOrEqual(MIN_ADJACENT_DELTA_E)
      }
    })
  }
})

describe('ramp: incomplete-hold grey categorical distinctness (D-20)', () => {
  const bandColours = rampBandColours(CVD_BAND_COUNT)

  test('INCOMPLETE_RGBA is at least MIN_CATEGORICAL_DELTA_E from every ramp band with no simulation applied', () => {
    const incompleteLab = srgbToLab(INCOMPLETE_RGBA)
    for (const band of bandColours) {
      const distance = deltaE76(incompleteLab, srgbToLab(band))
      expect(distance).toBeGreaterThanOrEqual(MIN_CATEGORICAL_DELTA_E)
    }
  })

  for (const deficiency of DEFICIENCIES) {
    test(`INCOMPLETE_RGBA is at least MIN_CATEGORICAL_DELTA_E from every ramp band under simulated ${deficiency}`, () => {
      const simulatedIncomplete = simulateCvd(INCOMPLETE_RGBA, deficiency)
      const incompleteLab = srgbToLab(simulatedIncomplete)
      for (const band of bandColours) {
        const simulatedBand = simulateCvd(band, deficiency)
        const distance = deltaE76(incompleteLab, srgbToLab(simulatedBand))
        expect(distance).toBeGreaterThanOrEqual(MIN_CATEGORICAL_DELTA_E)
      }
    })
  }
})

describe('ramp: lightness signal (not hue-only)', () => {
  test('the maximum L* across the 16 bands minus the minimum is at least 20', () => {
    const bandColours = rampBandColours(CVD_BAND_COUNT)
    const lValues = bandColours.map((rgba) => srgbToLab(rgba)[0])
    const max = Math.max(...lValues)
    const min = Math.min(...lValues)
    expect(max - min).toBeGreaterThanOrEqual(20)
  })
})

// Note (06-02-PLAN.md Task 1's own instruction): RUIN_BASE_RGBA is deliberately NOT asserted for
// colour separability here. Ruin is deliberately the same destructive hue the ruin banner and
// the equity-curve terminator already use, and under deuteranopia it sits close to the warm end
// of the ramp; D-18 resolves that with the hatch TEXTURE, which is not a colour channel and
// therefore cannot be measured by this colour-distance test. The hatch, not the hue, is what
// carries ruin's categorical distinctness.
