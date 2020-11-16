const through = require('pull-through')

function Clock() {
  if (!(this instanceof Clock)) return new Clock()
  this.timems = -1
}

Clock.prototype.tick = function (ms) {
  this.timems = ms
}

Clock.prototype.time = function () {
  return this.timems
}

function FrameBuffer(frame1, clock, timeout) {
  if (!(this instanceof FrameBuffer)) return new FrameBuffer(frame1, clock, timeout)
  this.clock = clock
  this.timeout = timeout
  this.encrypted = false
  this.speech = []
  this.meta = {
    time: frame1.ms, duration: 0,
    frequency: frame1.frequency,
    source: frame1.sourceId,
    group: frame1.groupId
  }
}

FrameBuffer.prototype.updateCrypto = function (frame) {
  if (frame.algid === 0x80) {
    this.encrypted = false
  } else {
    this.encrypted = true
  }
}

FrameBuffer.prototype.updateSource = function (frame) {
  if (this.meta.source <= 0 && frame.sourceId > 0) {
    this.meta.source = frame.sourceId
  }
}

FrameBuffer.prototype.next = function (frame) {
  this.meta.duration = frame.ms - this.meta.time
  switch (frame.duid) {
    case 0x00:
      this.updateCrypto(frame)
      break

    case 0x05:
      this.updateSource(frame)
      if (!this.encrypted) { this.speech = this.speech.concat(frame.speech) }
      break

    case 0x0A:
      this.updateCrypto(frame)
      if (!this.encrypted) { this.speech = this.speech.concat(frame.speech) }
      break
  }
}

FrameBuffer.prototype.timedout = function () {
  return this.clock.time() - (this.meta.time + this.meta.duration) > this.timeout
}

FrameBuffer.prototype.done = function () {
  if (this.encrypted) {
    return Object.assign({ speech: this.speech, encrypted: this.encrypted }, this.meta)
  } else {
    return Object.assign({ speech: this.speech }, this.meta)
  }
}

function hashcode(frame) {
  return frame.frequency + frame.groupId
}

module.exports = function (timeout) {
  const clock = new Clock()
  let bufs = new Map()

  return through(function (frame) {
    clock.tick(frame.ms)
    if (frame.duid !== 0x07) {
      const bufid = hashcode(frame)
      if (!bufs.has(bufid)) {
        bufs.set(bufid, new FrameBuffer(frame, clock, timeout))
      }
      bufs.get(bufid).next(frame)
    }

    Array.from(bufs.keys())
      .filter(bufid => bufs.get(bufid).timedout())
      .forEach(bufid => {
        this.queue(bufs.get(bufid).done())
        bufs.delete(bufid)
      })
  })
}
