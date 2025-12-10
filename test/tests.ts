/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2025 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect } from 'chai'
import { types, Autopilot } from '../dist/index'
import { TestApp, ExpectedEvent } from './utils'

Object.entries(types).forEach(([name, type]) => {
  if (name === 'emulator') {
    return
  }
  describe(`test ${name} autopilot`, function () {
    it(`putState works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,01,FE*4D'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126720,1,115,16,3b,9f,f0,81,86,21,01,fe,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65379,
                numberOfParameters: 4,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 4,
                    value: 'Auto, compass commanded'
                  },
                  {
                    parameter: 5,
                    value: 65535
                  }
                ],
                priority: 'Leave unchanged'
              }
            },
            generates: [
              {
                path: 'steering.autopilot.state',
                value: 'auto'
              }
            ]
          }
        ],
        simrad: []
      }

      if (!expected[name]) {
        done()
        return
      }
      const app = new TestApp(expected[name])

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putState(
        undefined,
        undefined,
        'auto',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putTargetHeading works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,89,1c82,1a,0,20*56' //FIXME: this is not correct
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,b7,7a/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65360,
                numberOfParameters: 3,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 6,
                    value: 3.141592653589793
                  }
                ],
                priority: 'Leave unchanged'
              }
            },
            generates: [
              {
                path: 'steering.autopilot.target.headingMagnetic',
                value: 3.141592653589793
              }
            ]
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'auto'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putTargetHeading(
          undefined,
          undefined,
          180,
          (res: any) => {
            expect(res.state).to.equal('COMPLETED')
            done()
          }
        )
        expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
        if (res.state === 'COMPLETED') {
          expect(res.statusCode).to.equal(200)
          done()
        }
      } else {
        done()
      }
    })

    it(`putTargetWind works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,10,01,0,3c*21'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126720,1,115,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,14,01,41,ff,00,f8,03,01,3b,07,03,04,04,e0,93/,
            generates: [
              {
                path: 'steering.autopilot.target.windAngleApparent',
                value: 0.5235987755982988
              }
            ]
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'wind'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putTargetWind(
          undefined,
          undefined,
          30,
          (res: any) => {
            expect(res.state).to.equal('COMPLETED')
            expect(res.statusCode).to.equal(200)
            done()
          }
        )
        expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
        if (res.state === 'COMPLETED') {
          expect(res.statusCode).to.equal(200)
          done()
        }
      } else {
        done()
      }
    })

    it(`putAdjustHeading works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,07,F8*36'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,7,126720,1,255,16,3b,9f,f0,81,86,21,07,f8,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126720,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Raymarine',
                industryCode: 'Marine Industry',
                command: 'Seatalk1',
                proprietaryId: 'Seatalk 1 Encoded',
                seatalk1Command: 'Keystroke',
                device: 33,
                key: '+1',
                keyinverted: 248
              }
            }
          }
        ],
        simrad: [],
        emulator: []
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'auto'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putAdjustHeading(
        undefined,
        undefined,
        1,
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putTack works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,21,DE*4D'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,7,126720,1,255,16,3b,9f,f0,81,86,21,21,de,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126720,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Raymarine',
                industryCode: 'Marine Industry',
                command: 'Seatalk1',
                proprietaryId: 'Seatalk 1 Encoded',
                seatalk1Command: 'Keystroke',
                device: 33,
                key: '-1 and -10',
                keyinverted: 222
              }
            }
          }
        ],
        simrad: []
      }

      if (!expected[name]) {
        done()
        return
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'wind'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putTack(
        undefined,
        undefined,
        'port',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putAdvanceWaypoint works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'error',
            value: 'Autopilot next waypoint not implemented'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,81,01,05,ff,ff/
          },
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,21,00,00,ef,01,ff,ff,ff,ff,ff,ff,04,01,3b,07,03,04,04,6c,05,1a,50/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65379,
                numberOfParameters: 4,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 4,
                    value: 'No Drift, COG referenced (In track, course changes)'
                  },
                  {
                    parameter: 5,
                    value: 65535
                  }
                ],
                priority: 'Leave unchanged'
              }
            }
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'route'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putAdvanceWaypoint(
          undefined,
          undefined,
          1,
          (res: any) => {
            if (name === 'raymarineST') {
              expect(res.state).to.equal('COMPLETED')
              expect(res.statusCode).to.equal(400)
            } else {
              expect(res.state).to.equal('COMPLETED')
              expect(res.statusCode).to.equal(200)
            }
            done()
          }
        )

        if (name === 'raymarineST') {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(400)
          done()
        } else {
          expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
          if (res.state === 'COMPLETED') {
            expect(res.statusCode).to.equal(200)
            done()
          }
        }
      } else {
        done()
      }
    })

    it(`putHullType works`, (done) => {
      if (name !== 'raymarineN2K') {
        // putHullType is only implemented in raymarineN2K
        done()
        return
      }

      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,19,01,00,ef,01,f8,05,01,3b,07,03,04,04,6c,05,16,50,06,08,52,ff/
          }
        ]
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'standby'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      if (!autopilot.putHullType) {
        done()
        return
      }

      const res = autopilot.putHullType(
        undefined,
        undefined,
        'power',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(200)
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putAutoTurn works`, (done) => {
      if (name !== 'raymarineN2K') {
        // putAutoTurn is only implemented in raymarineN2K
        done()
        return
      }

      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,18,01,00,ef,01,f8,05,01,3b,07,03,04,04,6c,05,26,50,06,01$/
          }
        ]
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'standby'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      if (!autopilot.putAutoTurn) {
        done()
        return
      }

      const res = autopilot.putAutoTurn(
        undefined,
        undefined,
        true,
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(200)
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })
  })
})
