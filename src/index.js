// ##################################
//  CONSTANTS
// ##################################

const fileName = "data/ts_scrobbles.csv"
const margin = { top: 20, right: 30, bottom: 60, left: 40 }
const width = 1200 - margin.left - margin.right
const contextHeight = 250 - margin.top - margin.bottom
const graphHeight = 600 - margin.top - margin.bottom
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
    .call(d3.axisBottom(x).ticks(d3.timeMonth).tickSizeOuter(0))
    .call((g) =>
      g
        .selectAll(".tick > text")
        .style("text-anchor", "start")
        .attr("transform", "rotate(45) translate(8 0)")
    )

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
    .call((g) => g.selectAll(".tick > line").attr("stroke-opacity", 0.5))

const xAxisGraph = (g, x) =>
  g
    .attr("transform", `translate(0, ${margin.top})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(width / 100)
        .tickSize(graphHeight - margin.bottom * 0.6)
        .tickSizeOuter(0)
    )
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .selectAll(".tick > line")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-dasharray", "2,2")
    )

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
  // const brushed = ({ selection: slct }) => {
  //   // Updates the currently selected range and triggers "input" callbacks.
  //   if (slct) {
  //     cx_svg.property("value", slct.map(cxX.invert, cxX).map(d3.utcDay.round))
  //     cx_svg.dispatch("input")
  //   }
  // }

  const brushed = ({ selection: slct }) => {
    if (!slct) brushg.call(brush.move, defaultSelection)
    else {
      cx_svg.property("value", slct.map(cxX.invert, cxX).map(d3.timeDay.round))
      cx_svg.dispatch("input")
    }
  }

  // Brush
  const brush = d3
    .brushX()
    .extent([
      [margin.left, 0.5],
      [width - margin.right, contextHeight - margin.bottom - 0.5],
    ])
    .on("end", brushed)
  // .on("end", brushended)

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

  // Add graph title
  plot
    .append("text")
    .attr("y", 12)
    .attr("x", 0)
    .attr("font-size", 10)
    .attr("font-family", "sans-serif")
    .attr("font-weight", "bold")
    .text("Listening history (artists)")

  // Graph scales
  const plotX = d3.scaleTime().range([0, width - margin.right])
  const plotY = d3
    .scaleLinear()
    .range([graphHeight - margin.bottom / 2, margin.top])

  // Graph generators
  const stack = d3
    .stack()
    .order(d3.stackOrderInsideOut)
    .offset(d3.stackOffsetWiggle)

  const area = d3
    .area()
    .curve(d3.curveMonotoneX)
    .x((d) => plotX(d.data.date))
    .y0((d) => plotY(d[0]))
    .y1((d) => plotY(d[1]))

  // Plot groups
  const streamgraphX = plot.append("g")
  const streamgraph = plot.append("g")

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
    ).sort((a, b) => b[1] - a[1])
    const artists = artistCounts.map((d) => d[0])

    const dataWindow = []
    dateRange.forEach((date) => {
      let d = weeklyArtistCounts.get(date)
      if (d) {
        let dObj = artists.map((track) => [track, d.get(track) || 0])
        dataWindow.push({ date, ...Object.fromEntries(dObj) })
      }
    })

    if (dataWindow.length != dateRange.length)
      console.log("Missing weeks!!!", dataWindow.length, dateRange.length)

    // Generate the series based on the data window
    const series = stack.keys(artists)(dataWindow)

    // Update the axis
    plotX.domain(d3.extent(dateRange))
    plotY.domain([
      d3.min(series, (d) => d3.min(d, (d) => d[0])),
      d3.max(series, (d) => d3.max(d, (d) => d[1])),
    ])

    // // Map colors to artists
    // const artistSat = d3
    //   .scaleOrdinal()
    //   .domain(artists)
    //   .range(artists.map((_, i) => saturationScale(i)))

    // const artistHue = d3
    //   .scaleOrdinal()
    //   .domain(artists)
    //   .range(d3.range(artists.length).map((d) => (d / artists.length) * 360))

    const middle = (artists.length - 1) / 2
    const colorScale = d3
      .scaleSequential(d3.interpolateInferno)
      .domain([0, middle])

    streamgraphX.call(xAxisGraph, plotX)
    streamgraph
      .selectAll("path")
      .data(series)
      .join("path")
      .attr("fill", ({ index }) => colorScale(Math.abs(index - middle)))
      .attr("d", area)
      .append("title")
      .text(({ key }) => key)
  })

  // Create the brush and move it into default position.
  // This will also trigger the initial render.
  brushg.call(brush).call(brush.move, defaultSelection)
}

main()
