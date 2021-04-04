// ##################################
//  CONSTANTS
// ##################################

const fileName = "data/ts_scrobbles.csv"
const plotContainer = "div#plot-container"
const margin = { top: 10, right: 30, bottom: 30, left: 10 }
const width = 1200 - margin.left - margin.right
const contextHeight = 100 - margin.top - margin.bottom
const barplotHeight = 600 - margin.top - margin.bottom
const barHeight = 25
const duration = 250
const topN = 12
const keyframes = 10
const genres = [
  "rock",
  "pop",
  "new wave",
  "post punk",
  "indie rock",
  "soul",
  "80s",
  "60s",
  "70s",
  "hip-hop",
  "metal",
  "gothic rock",
  "jazz",
  "blues",
  "alternative",
  "pop punk",
  "indie pop",
]

// ##################################
//  DATA PROCESSING
// ##################################

const parseTime = d3.timeParse("%Y-%m-%d")

const transformData = ({ ts, track, artist, album }) => ({
  date: parseTime(ts.split(" ")[0]),
  track,
  artist,
  album,
  genre: genres[~~(Math.random() * genres.length)],
})

const addDays = (date, days) => {
  var result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const getCumulativeTimeSeries = (data) => {
  let start = data[data.length - 1].date
  let end = addDays(data[0].date, 1)
  let days = d3.timeDays(start, end)
  let scrobbleCounts = d3.rollup(
    data, // Get scrobble counts
    (v) => v.length, // Counts
    (d) => d.date // Combine by Date
  )

  let total = 0
  let cumulativeSeries = days.map((day) => ({
    date: day,
    count: (total += scrobbleCounts.get(day) || 0),
    exists: scrobbleCounts.has(day),
  }))

  return cumulativeSeries
}

// ##################################
//  PRE-RENDERING
// ##################################

// Context graph
const context = d3
  .select(plotContainer)
  .append("svg")
  .style("display", "block")
  .attr("width", width + margin.left + margin.right)
  .attr("height", contextHeight + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
  .on("input", ({ target }) => console.log(target.value))

// Context axis
const contextX = d3.scaleUtc().range([0, width])
const contextY = d3.scaleLinear().range([contextHeight, 0])

// Context area
const valueArea = d3
  .area()
  .x((d) => contextX(d.date))
  .y0(contextY(0))
  .y1((d) => contextY(d.count))

// Context brush & default selection
const brushg = context.append("g")
const defaultSelection = () => [
  contextX(d3.utcYear.floor(contextX.domain()[1])),
  contextX.range()[1],
]

// Brush functions
const brushed = ({ selection }) => {
  if (selection) {
    // Updates the currently selected range and triggers "input" callbacks.
    context.property(
      "value",
      selection.map(contextX.invert, contextX).map(d3.utcDay.round)
    )
    context.dispatch("input")
  }
}
const brushended = ({ selection }) => {
  if (!selection) brushg.call(brush.move, defaultSelection)
}

// Brush
const brush = d3
  .brushX()
  .extent([
    [0, 0],
    [width, contextHeight - 1],
  ])
  .on("brush", brushed)
  .on("end", brushended)

// Barplot graph container
const barplot = d3
  .select(plotContainer)
  .append("svg")
  .style("display", "block")
  .attr("width", width + margin.left + margin.right)
  .attr("height", barplotHeight + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
  .attr("fill", "steelblue")

// Barplot axis
const barplotX = d3.scaleLinear().range([0, width])
const barplotY = d3.scaleBand().rangeRound([0, barplotHeight]).padding(0.1)

// ##################################
//  DATA LOADING
// ##################################
d3.csv(fileName, transformData).then((data) => {
  let ts = getCumulativeTimeSeries(data)

  let start = ts[0].date
  let end = ts[ts.length - 1].date
  let total = data.length

  // Scale the context axis
  contextX.domain([start, end])
  contextY.domain([0, total])

  // Add X axis
  context
    .insert("g", ":first-child")
    .attr("transform", "translate(0," + contextHeight + ")")
    .call(d3.axisBottom(contextX).tickSizeOuter(0))

  // Add area
  context
    .insert("path", ":first-child")
    .datum(ts)
    .attr("class", "area")
    .attr("d", valueArea)

  // Add brush & move it to a default selection
  brushg.call(brush).call(brush.move, defaultSelection)

  // Barchart
  const tracks = d3.rollup(
    data,
    (v) => v.length,
    (d) => d.track + ", " + d.artist
  )

  // console.log(d3.greatest(tracks, (v) => v[1]))
  let k = 10
  let tracksCpy = Array.from(tracks)
  let comparator = (a, b) => b[1] - a[1]
  d3.quickselect(tracksCpy, k, 0, tracks.length, comparator)
  let topTracks = tracksCpy.slice(0, k).sort(comparator)

  // Scale the barplot axis
  barplotX.domain([start, end])
  barplotY.domain([0, total])

  barplot
    .selectAll("rect")
    .data(topTracks)
    .join("rect")
    .attr("x", barplotX(0))
    .attr("y", (_, i) => barplotY(i))
    .attr("width", (d) => barplotX(d[1]) - barplotX(0))
    .attr("height", barplotY.bandwidth())

  barplot
    .append("g")
    .attr("fill", "white")
    .attr("text-anchor", "end")
    .attr("font-family", "sans-serif")
    .attr("font-size", "12px")
    .selectAll("text")
    .data(topTracks)
    .join("text")
    .attr("x", (d) => barplotX(d[1]))
    .attr("y", (_, i) => barplotY(i) + barplotY.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("dx", -4)
    .text((d) => format(d[0]))
    .call((text) =>
      text
        .filter((d) => barplotX(d[1]) - barplotX(0) < 20) // short bars
        .attr("dx", +4)
        .attr("fill", "black")
        .attr("text-anchor", "start")
    )
})
