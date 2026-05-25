const canvasSize = Number.parseInt(process.env.CANVAS_SIZE || '64', 10)

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function preparePixel(context, events, done) {
  context.vars.pixel = {
    x: randomInt(0, canvasSize - 1),
    y: randomInt(0, canvasSize - 1),
    color: randomInt(0, 15)
  }

  return done()
}

module.exports = {
  preparePixel
}
