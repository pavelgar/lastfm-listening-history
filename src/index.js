// ##################################
//  CONSTANTS
// ##################################

const fileName = "data/ts_scrobbles.csv"
const margin = { top: 20, right: 30, bottom: 60, left: 40 }
const width = 1200 - margin.left - margin.right
const contextHeight = 250 - margin.top - margin.bottom
const graphHeight = 500 - margin.top - margin.bottom
const k = 9 // Number of tracks to display
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

const container = d3.select("div#plot-container")

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

const getDayilyScrobbles = (data) => {
  let start = data[data.length - 1].date
  let end = addDays(data[0].date, 1)
  let days = d3.timeDays(start, end)
  let scrobbleCounts = d3.rollup(
    data, // Get scrobble counts
    (v) => v.length, // Counts
    (d) => d.date // Combine by Date
  )

  return days.map((date) => ({
    date,
    count: scrobbleCounts.get(date) || 0,
  }))
}

const getCounts = (d, by, accessor) =>
  d3.rollup(
    d,
    (v) => v.length,
    (d) => by(d.date),
    accessor
  )

// ##################################
//  AXIS FUNCTIONS
// ##################################
const xAxis = (g, x) =>
  g
    .attr("transform", `translate(0, ${contextHeight - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(width / 40)
        .tickSizeOuter(0)
    )
    .call((g) =>
      g
        .selectAll(".tick > text")
        .style("text-anchor", "start")
        .attr("transform", "rotate(45) translate(8 0)")
    )

// TODO: Delet dis
const xAxisTop = (g, x) =>
  g
    .attr("transform", `translate(0, ${margin.top})`)
    .call(d3.axisTop(x).ticks(width / 80))
    .call((g) => g.select(".domain").remove())

const yAxis = (g, y, title) =>
  g
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y).ticks(contextHeight / 40))
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .select(".tick:last-of-type text")
        .clone()
        .attr("x", -margin.left)
        .attr("y", -margin.top)
        .attr("text-anchor", "start")
        .attr("font-weight", "bold")
        .text(title)
    )

const xAxisGraph = (g, x) =>
  g
    .attr("transform", `translate(0, ${graphHeight - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(width / 80)
        .tickSizeOuter(0)
    )
    .call((g) => g.select(".domain").remove())

async function main() {
  // ##################################
  //  DATA LOADING AND PREPROCESSING
  // ##################################
  const data = await d3.csv(fileName, transformData)
  // Start and end day of the data
  const dataExtent = d3.extent(data, (d) => d.date)
  // Every week between the beginning and the end of data
  const thresholds = d3.timeWeeks(...dataExtent)

  // Group data into bins
  const bins = d3
    .bin()
    .domain(dataExtent)
    .thresholds(thresholds)
    .value((d) => d.date)(data)

  // Context X and Y
  const cxX = d3
    .scaleTime()
    .domain(dataExtent)
    .range([margin.left, width - margin.right])

  const cxY = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (d) => d.length)])
    .range([contextHeight - margin.bottom, margin.top])
    .nice()

  // ##################################
  //  CONTEXT GRAPH AND BRUSH
  // ##################################
  const cx_svg = container
    .append("svg")
    .attr("viewBox", [0, 0, width, contextHeight])
    .attr("preserveAspectRatio", "xMinYMin meet")

  // Create the bars
  cx_svg
    .insert("g", ":first-child")
    .attr("fill", "steelblue")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (d) => cxX(d.x0) + 1)
    .attr("y", (d) => cxY(d.length))
    .attr("width", (d) => Math.max(0, cxX(d.x1) - cxX(d.x0) - 1))
    .attr("height", (d) => cxY(0) - cxY(d.length))

  // Create the X and Y axis
  cx_svg.append("g").call(xAxis, cxX)
  cx_svg.append("g").call(yAxis, cxY, "Weekly scrobbles")

  // Create the brush
  const brushg = cx_svg.append("g")

  // Set default selection to beginning of the latest year
  const defaultSelection = [cxX(d3.timeYear(cxX.domain()[1])), cxX.range()[1]]

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
      [width - margin.right, contextHeight - margin.bottom - 0.5],
    ])
    .on("brush", brushed)
    .on("end", brushended)

  // ##################################
  //  STREAMGRAPH
  // ##################################
  // Count scrobbles for each artist by week
  const weeklyArtistCounts = getCounts(data, d3.timeMonday, (d) => d.artist)

  // The graph container
  const plot = container
    .append("svg")
    .attr("viewBox", [0, 0, width, graphHeight])
    .attr("preserveAspectRatio", "xMinYMin meet")

  // Graph scales
  const plotX = d3.scaleTime().range([margin.left, width - margin.right])
  const plotY = d3
    .scaleLinear()
    .range([graphHeight - margin.bottom, margin.top])

  // Graph generator
  const stack = d3
    .stack()
    .offset(d3.stackOffsetWiggle)
    .order(d3.stackOrderInsideOut)

  // Plot groups
  const streamgraph = plot.append("g")
  const streamgraphX = plot.append("g")

  const area = d3
    .area()
    .x((d) => plotX(d.data.date))
    .y0((d) => plotY(d[0]))
    .y1((d) => plotY(d[1]))

  const comparator = (a, b) => b[1] - a[1]

  // Register brush event handler
  cx_svg.on("input", ({ target }) => {
    const [min, max] = [target.value[0], d3.timeDay.offset(target.value[1], 1)]
    const dateRange = d3.timeMondays(min, max)
    // Get the overall scrobble counts for the selected window
    const artistCounts = Array.from(
      d3.rollup(
        data.filter(({ date }) => date > min && date < max),
        (v) => v.length,
        (d) => d.artist
      )
    )

    // Select top k scrobbled artists
    const topArtists = d3
      .quickselect(artistCounts, k, 0, artistCounts.length - 1, comparator)
      .slice(0, k)
      .map((d) => d[0])

    // Extract the scrobbles of each top artist for each time interval
    const dataWindow = []
    dateRange.forEach((date) => {
      let d = weeklyArtistCounts.get(date)
      if (d) {
        let dObj = topArtists.map((track) => [track, d.get(track) || 0])
        dataWindow.push({ date, ...Object.fromEntries(dObj) })
      }
    })

    // Generate the series based on the data window
    const series = stack.keys(topArtists)(dataWindow)

    // Update the axis
    plotX.domain(d3.extent(dateRange))
    plotY.domain([
      d3.min(series, (d) => d3.min(d, (d) => d[0])),
      d3.max(series, (d) => d3.max(d, (d) => d[1])),
    ])

    // Map colors to artists
    // TODO: Make this work with linearly scaled colors
    const color = d3.scaleOrdinal(topArtists, d3.schemeOrRd[k])

    streamgraph
      .selectAll("path")
      .data(series)
      .join("path")
      .attr("fill", ({ key }) => color(key))
      .attr("d", area)
      .append("title")
      .text(({ key }) => key)

    streamgraphX.call(xAxisGraph, plotX)
  })

  // Create the brush and move it into default position.
  // This will also trigger the initial render.
  brushg.call(brush).call(brush.move, defaultSelection)
}

main()
