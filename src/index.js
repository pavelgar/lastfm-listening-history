// ##################################
//  CONSTANTS
// ##################################

const fileName = "data/ts_scrobbles.csv"
const margin = { top: 20, right: 30, bottom: 20, left: 10 }
const width = 900 - margin.left - margin.right
const contextHeight = 120 - margin.top - margin.bottom
const barplotHeight = 500 - margin.top - margin.bottom
const k = 10 // Number of tracks to display
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

const container = d3
  .select("div#plot-container")
  .style(
    "height",
    2 * (margin.top + margin.bottom) + contextHeight + barplotHeight
  )

// ##################################
//  DATA PROCESSING FUNCTIONS
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

const getCumulativeDayScrobbles = (data) => {
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
//  AXIS & AREA FUNCTIONS
// ##################################

// X-axis creation functions
const xAxis = (g, x, height) =>
  g.attr("transform", `translate(0, ${height - margin.bottom})`).call(
    d3
      .axisBottom(x)
      .ticks(width / 80)
      .tickSizeOuter(0)
  )

const xAxisTop = (g, x) =>
  g
    .attr("transform", `translate(0, ${margin.top})`)
    .call(d3.axisTop(x).ticks(width / 80))
    .call((g) => g.select(".domain").remove())

// Y-axis creation function
const yAxis = (g, y, title) =>
  g
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y))
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .selectAll(".title")
        .data([title])
        .join("text")
        .attr("class", "title")
        .attr("x", -margin.left)
        .attr("y", 10)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text(title)
    )

async function main() {
  const data = await d3.csv(fileName, transformData)
  const ts = getCumulativeDayScrobbles(data) // Daily scrobble counts

  // Context X and Y
  const cxX = d3
    .scaleUtc()
    .domain(d3.extent(ts, (d) => d.date))
    .range([margin.left, width - margin.right])

  const cxY = d3
    .scaleLinear()
    .domain([0, data.length])
    .range([contextHeight - margin.bottom, margin.top])

  // Context area
  const area = (x, y) =>
    d3
      .area()
      .defined((d) => !isNaN(d.count))
      .x((d) => cxX(d.date))
      .y0(cxY(0))
      .y1((d) => cxY(d.count))

  // ##################################
  //  CONTEXT GRAPH AND BRUSH
  // ##################################
  const cx_svg = container
    .append("svg")
    .attr("viewBox", [0, 0, width, contextHeight])
    .attr("preserveAspectRatio", "xMinYMin meet")

  // Create the area
  cx_svg
    .insert("path", ":first-child")
    .datum(ts)
    .attr("class", "area")
    .attr("d", area)

  // Create the X and Y axis
  cx_svg.append("g").call(xAxis, cxX, contextHeight)
  cx_svg
    .append("path")
    .datum(ts)
    .attr("fill", "steelblue")
    .attr("d", area(cxX, cxY.copy().range([contextHeight - margin.bottom, 4])))

  const brushg = cx_svg.append("g")

  // Set default selection to beginning of the latest year
  const defaultSelection = [
    cxX(d3.utcYear.floor(cxX.domain()[1])),
    cxX.range()[1],
  ]

  // Brush functions
  const brushed = ({ selection: slct }) => {
    // Updates the currently selected range and triggers "input" callbacks.
    if (slct) {
      cx_svg.property("value", slct.map(cxX.invert, cxX).map(d3.utcDay.round))
      cx_svg.dispatch("input")
    }
  }

  const brushended = ({ selection }) => {
    if (!selection) brushg.call(brush.move, defaultSelection)
  }

  // Brush
  const brush = d3
    .brushX()
    .extent([
      [margin.left, 0.5],
      [width - margin.right, contextHeight - margin.bottom + 0.5],
    ])
    .on("brush", brushed)
    .on("end", brushended)

  // Create the brush and move it into position
  brushg.call(brush).call(brush.move, defaultSelection)

  // ##################################
  //  BARPLOT GRAPH
  // ##################################
  // Barplot axis
  const barX = d3.scaleLinear().range([margin.left, width - margin.right])
  const barY = d3
    .scaleBand()
    .domain(d3.range(k))
    .rangeRound([margin.top, barplotHeight - margin.bottom])
    .padding(0.1)

  // Barplot graph container
  const barplot = container
    .append("svg")
    .attr("viewBox", [0, 0, width, barplotHeight])
    .attr("preserveAspectRatio", "xMinYMin meet")

  // Draw the barplot
  const bars = barplot.append("g")

  // Draw the barplot labels
  const barLabels = barplot
    .append("g")
    .attr("fill", "white")
    .attr("text-anchor", "end")
    .attr("font-family", "sans-serif")
    .attr("font-size", 12)

  // X axis
  const barplotX = barplot.append("g")

  const updateBars = (_, newData) => {
    // Update X axis
    barX.domain([0, newData[0][1]])

    barplotX.selectAll("g.tick").remove()
    barplotX.call(xAxisTop, barX)

    // Barplot bars
    bars.selectAll("rect").remove()
    bars
      .selectAll("rect")
      .data(newData)
      .join("rect")
      .attr("fill", "teal")
      .attr("x", barX(0))
      .attr("y", (_, i) => barY(i))
      .attr("width", (d) => barX(d[1]))
      .attr("height", barY.bandwidth())

    // Barplot labels
    barLabels.selectAll("text").remove()
    barLabels
      .selectAll("text")
      .data(newData)
      .join("text")
      .attr("x", (d) => barX(d[1]))
      .attr("y", (_, i) => barY(i) + barY.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("dx", -4)
      .text((d) => d[0])
    // .call((text) =>
    //   text
    //     .filter(
    //       // Select the short bars
    //       (d) => d[1] < 15
    //     )
    //     .attr("dx", +4)
    //     .attr("fill", "black")
    //     .attr("text-anchor", "start")
    // )
  }

  const comparator = (a, b) => b[1] - a[1]
  const onSelectionUpdate = (event) => {
    // Select scrobbles from the selected date range
    let [min, max] = event.target.value
    let dataslice = data.filter(({ date }) => date > min && date < max)

    // Count scrobbles for each track + artist
    let trackCounts = Array.from(
      d3.rollup(
        dataslice,
        (v) => v.length,
        (d) => d.track + ", " + d.artist
      )
    )

    // Select top k scrobbled artists
    let topTracks = d3
      .quickselect(trackCounts, k, 0, trackCounts.length - 1, comparator)
      .slice(0, k)
      .sort(comparator)

    barplot.call(updateBars, topTracks)
  }

  cx_svg.on("input", onSelectionUpdate)
}

main()
