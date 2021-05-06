// ##################################
//  CONSTANTS
// ##################################

const fileName = "./src/data/ts_scrobbles.csv"
const margin = { top: 20, right: 30, bottom: 60, left: 40 }
// Width of the graph containers
const width = 1200 - margin.left - margin.right
// Actual width of the context graph
const contextWidth = width - margin.left - margin.right
// Height of the graph containers
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

const parseTime = d3.timeParse("%Y-%m-%d %H:%M:S%Z")

const transformData = ({ ts, track, artist, album }) => ({
  date: new Date(ts),
  track,
  artist,
  album,
  genre: genres[~~(Math.random() * genres.length)],
})

// Function for counting scrobbles by some interval (e.g. weeks or days)
const getCounts = (d, by, accessor) =>
  d3.rollup(
    d,
    (v) => v.length,
    (d) => by(d.date),
    accessor
  )

const addTitle = (g, title, fontSize = 10) =>
  g
    .append("text")
    .attr("y", fontSize)
    .attr("x", fontSize)
    .attr("font-size", fontSize)
    .attr("font-family", "sans-serif")
    .attr("font-weight", "bold")
    .text(title)

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

const yAxis = (g, y) =>
  g
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y).ticks(contextHeight / 40))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll(".tick > line").attr("stroke-opacity", 0.6))

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
  const dataTimeExtent = d3.extent(data, (d) => d.date)
  // Every week between the beginning and the end of data
  const weeks = d3.timeMondays(...dataTimeExtent)

  // Group data into bins
  const bins = d3
    .bin()
    .domain(dataTimeExtent)
    .thresholds(weeks)
    .value((d) => d.date)(data)

  // Context X and Y
  const cxX = d3
    .scaleTime()
    .domain(dataTimeExtent)
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

  // Title
  cx_svg.call(addTitle, "Weekly scrobbles")

  // Create the bars
  cx_svg
    .insert("g", ":first-child")
    .classed("bars", true)
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

  const brushended = ({ selection }) => {
    if (!selection) brushg.call(brush.move, defaultSelection)
    else {
      cx_svg.property("value", selection)
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
    .on("end", brushended)

  // ##################################
  //  STREAMGRAPH
  // ##################################
  // Count scrobbles for each artist by week
  const weeklyArtistCounts = getCounts(data, d3.timeMonday, (d) => d.artist)

  // Store current window for small calculations
  let window = []

  // Count the overall scrobbles for each artist
  const overallScrobbles = d3.rollup(
    data,
    (v) => v.length,
    (d) => d.artist
  )

  // Get all the artists as a list
  const artists = Array.from(overallScrobbles.keys())

  // Mirror the color scale about the middle
  const middle = (artists.length - 1) / 2
  const colorScale = d3
    .scaleSequential(d3.interpolateInferno)
    .domain([0, middle])

  // Generate a base week
  const zeroWeek = artists.map((track) => [track, 0])

  // Fill missing data points
  const stackData = weeks.map((date) => {
    let d = weeklyArtistCounts.get(date)
    let dObj = zeroWeek.slice()
    if (d) dObj = artists.map((track) => [track, d.get(track) || 0])
    return { date, ...Object.fromEntries(dObj) }
  })

  // Generate a series representation of the data
  const series = d3
    .stack()
    .keys(artists)
    .order(d3.stackOrderInsideOut)
    .offset(d3.stackOffsetWiggle)(stackData)

  // Graph scales
  const plotX = cxX.copy().range([0, width])
  const plotY = d3
    .scaleLinear()
    .domain([
      d3.min(series, (d) => d3.min(d, (t) => t[0])),
      d3.max(series, (d) => d3.max(d, (t) => t[1])),
    ])
    .range([graphHeight - margin.bottom / 2, margin.top])

  // Area generator function (with smoothing)
  const areaGen = d3
    .area()
    .curve(d3.curveMonotoneX)
    .x((d) => plotX(d.data.date))
    .y0((d) => plotY(d[0]))
    .y1((d) => plotY(d[1]))

  // The graph container
  const plot = container
    .append("svg")
    .attr("viewBox", [0, 0, width, graphHeight])
    .attr("preserveAspectRatio", "xMinYMin meet")

  const plotDefs = plot.append("defs")

  // Drop shadow
  const dropShadowID = "plot-dropshadow"
  const shadowFilter = plotDefs
    .append("filter")
    .attr("id", dropShadowID)
    .attr("height", "130%")
  shadowFilter
    .append("feGaussianBlur")
    .attr("in", "sourceAlpha")
    .attr("stdDeviation", 3)
    .attr("result", "blur")
  shadowFilter
    .append("feOffset")
    .attr("in", "blur")
    .attr("dx", 3)
    .attr("dy", 3)
    .attr("result", "offsetBlur")

  const feMerge = shadowFilter.append("feMerge")
  feMerge.append("feMergeNode").attr("in", "offsetBlur")
  feMerge.append("feMergeNode").attr("in", "SourceGraphic")

  // X-axis container
  const gx = plot.append("g")

  // Add a title
  plot.call(addTitle, "Listening history (artists)")

  // Area container
  const area = plot
    .append("g")
    .classed("streams", true)
    .attr("stroke", colorScale(0))
    .attr("stroke-width", 0)

  // Legend
  const legendFontSize = 10
  const legendPadding = legendFontSize / 2
  const legendWidth = width / 7
  const legendHeight = (legendFontSize + legendPadding) * 4 + legendPadding
  const legendX = width - legendWidth - margin.right
  const legendY = graphHeight - legendHeight - margin.bottom
  const legend = plot
    .append("g")
    .classed("legend-area", true)
    .attr("font-size", legendFontSize)
    .attr("transform", `translate(${legendX}, ${legendY})`)

  legend
    .append("rect")
    .style("filter", `url(#${dropShadowID})`)
    .attr("fill", "rgb(251, 253, 255)")
    .attr("stroke", "black")
    .attr("stroke-width", 1)
    .attr("x", 0)
    .attr("y", 0)
    .attr("rx", 2)
    .attr("ry", 2)
    .attr("width", legendWidth)
    .attr("height", legendHeight)

  // Legend title
  const legendTitle = legend
    .append("text")
    .classed("legend-mean", true)
    .attr("x", legendPadding)
    .attr("y", legendFontSize + legendPadding)
    .attr("font-weight", "bold")

  // Legend total
  const legendTotal = legend
    .append("text")
    .attr("x", legendPadding)
    .attr("y", (legendFontSize + legendPadding) * 2)

  // Legend mean
  const legendMean = legend
    .append("text")
    .attr("x", legendPadding)
    .attr("y", (legendFontSize + legendPadding) * 3)

  // Legend median
  const legendMedian = legend
    .append("text")
    .attr("x", legendPadding)
    .attr("y", (legendFontSize + legendPadding) * 4)

  // Tooltip
  const tooltipFontSize = 12
  const tooltip = plot
    .append("g")
    .classed("tooltip-area", true)
    .attr("font-size", tooltipFontSize)
    .attr("opacity", 0)
  // Artist name
  tooltip
    .append("text")
    .classed("tooltip-artist", true)
    .attr("x", tooltipFontSize)
    .attr("y", 0)
  // Scrobble counts
  tooltip
    .append("text")
    .classed("tooltip-scrobbles", true)
    .attr("x", tooltipFontSize)
    .attr("y", tooltipFontSize)

  // Render the streams
  const streams = area
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("d", areaGen)
    .attr("fill", ({ index }) => colorScale(Math.abs(index - middle)))

  // Mouse entering event
  const mouseenter = (e, d) => {
    // Update areas
    streams.attr("fill-opacity", 0.5)
    d3.select(e.target).attr("stroke-width", 0.1).attr("fill-opacity", 1)

    // Update tooltip
    let count = window.filter((s) => s.artist == d.key).length
    tooltip.select("text.tooltip-artist").text(d.key)
    tooltip.select("text.tooltip-scrobbles").text(`${count} scrobbles`)
    tooltip.attr("opacity", 1)
  }

  // Mouse moving event
  const mousemove = (e) => {
    // Update tooltip position to mouse position
    const pos = d3.pointer(e, plot.node())
    tooltip.attr("transform", `translate(${pos})`)
  }

  // Mouse exiting event
  const mouseleave = (e) => {
    // Set everything back to initial state
    streams.attr("fill-opacity", 1)
    d3.select(e.target).attr("stroke-width", 0)
    tooltip.attr("opacity", 0)
  }

  streams
    .on("mouseenter", mouseenter)
    .on("mousemove", mousemove)
    .on("mouseleave", mouseleave)

  // Register brush event handler
  cx_svg.on("input", ({ target }) => {
    // Normalize the given values of the context graph
    const [min, max] = target.value.map((v) => v - margin.left)
    // Get the corresponding start and end dates
    const extent = target.value.map(cxX.invert, cxX) //.map(d3.utcDay.round)
    // Update the x axis
    plotX.domain(extent)
    const t = d3.transition().duration(500)
    gx.transition(t).call(xAxisGraph, plotX)

    // Update the legend info
    window = data.filter((d) => d.date >= extent[0] && d.date <= extent[1])

    const dailyWindow = d3.rollup(
      window,
      (v) => v.length,
      (d) => d3.timeDay(d.date)
    )
    const weeks = d3.timeMonday.count(...extent)
    const mean = d3.mean(dailyWindow, (d) => d[1])
    const median = d3.median(dailyWindow, (d) => d[1])

    legendTitle.text(`Current view (${weeks} weeks)`)
    legendTotal.text(`Total: ${window.length} scrobbles`)
    legendMean.text(`Mean: ${Math.round(mean)} scrobbles/day`)
    legendMedian.text(`Median: ${median} scrobbles/day`)

    // Calculate the scaling factor and translation amount
    const scaling = contextWidth / (max - min)
    const translation = -width * (min / contextWidth) * scaling

    // Update the area transformation
    area
      .transition(t)
      .attr("transform", `translate(${translation}, 0) scale(${scaling}, 1)`)
  })

  // Create the brush and move it into default position.
  // This will also trigger the initial render.
  brushg.call(brush).call(brush.move, defaultSelection)
}

main()
