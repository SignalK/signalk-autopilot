import { expect } from 'chai'
import { types } from '../dist/index'
import { TestApp } from './utils'

const trackTruePath = 'navigation.course.calcValues.bearingTrackTrue.value'
const trackMagneticPath =
  'navigation.course.calcValues.bearingTrackMagnetic.value'
const waypointMagneticPath =
  'navigation.course.calcValues.bearingMagnetic.value'
const xtePath = 'navigation.course.calcValues.crossTrackError.value'
const variationPath = 'navigation.magneticVariation.value'
const targetPath = 'steering.autopilot.target.headingMagnetic.value'
const statePath = 'steering.autopilot.state.value'
const invalidVariations = [undefined, null, NaN, Infinity, '0']

function nextUpdate(app: TestApp): Promise<void> {
  return new Promise((resolve) => {
    const handleMessage = app.handleMessage
    app.handleMessage = (id, message) => {
      handleMessage.call(app, id, message)
      app.handleMessage = handleMessage
      resolve()
    }
  })
}

describe('emulator route data', () => {
  it('keeps a north track target with zero XTE instead of the current heading', () => {
    const app = new TestApp([], {
      [trackTruePath]: 0,
      [trackMagneticPath]: Math.PI,
      [xtePath]: 0,
      [variationPath]: 0,
      'navigation.headingMagnetic.value': Math.PI / 2
    })
    const autopilot = types.emulator(app)
    autopilot.start({})

    try {
      expect(
        autopilot.putState(undefined, undefined, 'route').statusCode
      ).to.equal(200)
      expect(app.getSelfPath(targetPath)).to.equal(0)
    } finally {
      autopilot.stop()
    }
  })

  for (const variation of invalidVariations) {
    it(`uses the magnetic track when magnetic variation is invalid (${String(variation)})`, () => {
      const app = new TestApp([], {
        [trackTruePath]: Math.PI,
        [trackMagneticPath]: Math.PI / 2,
        [variationPath]: variation,
        [xtePath]: 100
      })
      const autopilot = types.emulator(app)
      autopilot.start({ routeXteLookahead: 100 })

      try {
        expect(
          autopilot.putState(undefined, undefined, 'route').statusCode
        ).to.equal(200)
        expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 4, 0.000001)
      } finally {
        autopilot.stop()
      }
    })
  }

  it('corrects the magnetic track bearing instead of steering to the waypoint', () => {
    const app = new TestApp([], {
      [trackTruePath]: null,
      [trackMagneticPath]: Math.PI / 2,
      [waypointMagneticPath]: Math.PI,
      [xtePath]: 100
    })
    const autopilot = types.emulator(app)
    autopilot.start({ routeXteLookahead: 100 })

    try {
      expect(
        autopilot.putState(undefined, undefined, 'route').statusCode
      ).to.equal(200)
      expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 4, 0.000001)
    } finally {
      autopilot.stop()
    }
  })

  it('caps the correction on both sides of the track', () => {
    const app = new TestApp([], {
      [trackMagneticPath]: Math.PI / 2,
      [xtePath]: 10000
    })
    const autopilot = types.emulator(app)
    autopilot.start({ routeXteLookahead: 100, routeMaxXteCorrection: 30 })

    try {
      autopilot.putState(undefined, undefined, 'route')
      expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 3, 0.000001)

      app.paths[xtePath] = -10000
      autopilot.putState(undefined, undefined, 'route')
      expect(app.getSelfPath(targetPath)).to.be.closeTo(
        (2 * Math.PI) / 3,
        0.000001
      )
    } finally {
      autopilot.stop()
    }
  })

  const invalidCourses = [
    { name: 'no course data', paths: {} },
    ...invalidVariations.map((variation) => ({
      name: `a true track without valid magnetic variation (${String(variation)})`,
      paths: {
        [trackTruePath]: Math.PI / 2,
        [variationPath]: variation,
        [xtePath]: 0
      }
    })),
    {
      name: 'only the bearing to the waypoint',
      paths: { [waypointMagneticPath]: Math.PI, [xtePath]: 0 }
    },
    ...[null, NaN, Infinity, '1'].map((bearing) => ({
      name: `an invalid track bearing (${String(bearing)})`,
      paths: {
        [trackMagneticPath]: bearing,
        [waypointMagneticPath]: Math.PI,
        [xtePath]: 0
      }
    })),
    ...[undefined, null, NaN, Infinity, '1'].map((xte) => ({
      name: `an invalid cross-track error (${String(xte)})`,
      paths: { [trackMagneticPath]: Math.PI / 2, [xtePath]: xte }
    }))
  ]

  for (const { name, paths } of invalidCourses) {
    it(`rejects route with ${name} without changing the current mode or target`, () => {
      const app = new TestApp([], {
        ...paths,
        'navigation.headingMagnetic.value': Math.PI / 2
      })
      const autopilot = types.emulator(app)
      autopilot.start({})

      try {
        autopilot.putState(undefined, undefined, 'auto')
        const previousPaths = { ...app.paths }

        const result = autopilot.putState(undefined, undefined, 'route')

        expect(result.state).to.equal('COMPLETED')
        expect(result.statusCode).to.equal(400)
        expect(result.message).to.be.a('string')
        expect(result.message).not.to.equal('')
        expect(app.paths).to.deep.equal(previousPaths)
      } finally {
        autopilot.stop()
      }
    })
  }

  it('rejects missing course data through the promise interface', async () => {
    const app = new TestApp([])
    const autopilot = types.emulator(app)
    autopilot.start({})

    try {
      await autopilot.putStatePromise('route').then(
        () => expect.fail('Expected route mode to reject missing course data'),
        (error) => expect(error.statusCode).to.equal(400)
      )
    } finally {
      autopilot.stop()
    }
  })

  it('updates the route target as cross-track error changes, including zero', async () => {
    const app = new TestApp([], {
      [trackMagneticPath]: Math.PI / 2,
      [xtePath]: 100
    })
    const autopilot = types.emulator(app)
    autopilot.start({ routeXteLookahead: 100 })

    try {
      await autopilot.putStatePromise('route')
      expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 4, 0.000001)

      app.paths[xtePath] = 0
      await nextUpdate(app)

      expect(app.getSelfPath(statePath)).to.equal('route')
      expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 2, 0.000001)
    } finally {
      autopilot.stop()
    }
  })

  for (const [name, path] of [
    ['track bearing', trackMagneticPath],
    ['cross-track error', xtePath]
  ]) {
    it(`returns to standby and clears the target when ${name} disappears`, async () => {
      const app = new TestApp([], {
        [trackMagneticPath]: Math.PI / 2,
        [waypointMagneticPath]: Math.PI,
        [xtePath]: 0
      })
      const autopilot = types.emulator(app)
      autopilot.start({})

      try {
        await autopilot.putStatePromise('route')
        const previousValue = app.paths[path]
        app.paths[path] = null
        await nextUpdate(app)

        expect(app.getSelfPath(statePath)).to.equal('standby')
        expect(app.getSelfPath(targetPath)).to.equal(null)

        app.paths[path] = previousValue
        await nextUpdate(app)

        expect(app.getSelfPath(statePath)).to.equal('standby')
        expect(app.getSelfPath(targetPath)).to.equal(null)

        await autopilot.putStatePromise('route')
        expect(app.getSelfPath(statePath)).to.equal('route')
        expect(app.getSelfPath(targetPath)).to.be.closeTo(Math.PI / 2, 0.000001)
      } finally {
        autopilot.stop()
      }
    })
  }

  for (const magneticTrackAvailable of [true, false]) {
    it(`handles loss of magnetic variation ${magneticTrackAvailable ? 'using the magnetic track' : 'by returning to standby'}`, async () => {
      const app = new TestApp([], {
        [trackTruePath]: Math.PI / 2,
        [trackMagneticPath]: magneticTrackAvailable ? Math.PI : undefined,
        [variationPath]: Math.PI / 18,
        [xtePath]: 100
      })
      const autopilot = types.emulator(app)
      autopilot.start({ routeXteLookahead: 100 })

      try {
        await autopilot.putStatePromise('route')
        expect(app.getSelfPath(targetPath)).to.be.closeTo(
          (7 * Math.PI) / 36,
          0.000001
        )

        app.paths[variationPath] = null
        await nextUpdate(app)

        expect(app.getSelfPath(statePath)).to.equal(
          magneticTrackAvailable ? 'route' : 'standby'
        )
        if (magneticTrackAvailable) {
          expect(app.getSelfPath(targetPath)).to.be.closeTo(
            (3 * Math.PI) / 4,
            0.000001
          )
        } else {
          expect(app.getSelfPath(targetPath)).to.equal(null)
        }

        app.paths[variationPath] = Math.PI / 18
        await nextUpdate(app)

        expect(app.getSelfPath(statePath)).to.equal(
          magneticTrackAvailable ? 'route' : 'standby'
        )
        if (magneticTrackAvailable) {
          expect(app.getSelfPath(targetPath)).to.be.closeTo(
            (7 * Math.PI) / 36,
            0.000001
          )
        } else {
          expect(app.getSelfPath(targetPath)).to.equal(null)
          await autopilot.putStatePromise('route')
          expect(app.getSelfPath(statePath)).to.equal('route')
          expect(app.getSelfPath(targetPath)).to.be.closeTo(
            (7 * Math.PI) / 36,
            0.000001
          )
        }
      } finally {
        autopilot.stop()
      }
    })
  }
})
