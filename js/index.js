
/** mappings for layer/icon types */
var colorByTyp = {
  site: 'rgba(181, 226, 140, 0.6)',
  access: 'rgba(240, 194, 12, 0.6)',
};

// lookup of type (site, access) -> icon to represent the type
var iconsByTypProp = {
  site: new L.divIcon({
    iconSize: [23, 23],
    popupAnchor: [1, -24],
    html: '<i class="fas fa-campground"></i>',
    className: 'marker-single marker-site'
  }),
  access: new L.divIcon({
    iconSize: [23, 23],
    popupAnchor: [1, -24],
    html: '<i class="fas fa-ship"></i>',
    className: 'marker-single marker-access'
  }),
};

var typLabel = {
  site: 'WWTA Campsite',
  access: 'Public Boat Ramps',
}

// maps what to do for each feature in the Leaflet layer
var layerGeoJsonOptions = {
  // which icons go with each layer
  pointToLayer: function(feature, latlng) {
    return L.marker(latlng, {
      icon: iconsByTypProp[feature.properties.typ]
    });
  },
  // for each feature, bind a popup to the marker in the map that
  // contains the tooltipContent defined above
  onEachFeature: function (feature, layer) {
    layer.bindPopup(feature.properties.tooltipContent);
  }
};

// converts an array of markers to an array of GeoJson Point features
// also creates the tooltip content/ updates the URLs to point to the wwta website
// not the server we're currently on
function markersToGeojsonArray(markerArray) {
  var wwtaBaseUrl = 'https://www.wwta.org/cascadia-marine-trail-map/?page_id=';

  return markerArray.map(function (marker) {
    // find the relative url of each site and replace it with a full url
    var regex = /\?page_id=/gm;
    var details = marker.stedetails.replace(regex, wwtaBaseUrl);
    var tooltipContent = '<h3>' + marker.name + '</h3>' + details;

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(marker.lng), Number(marker.lat)],
      },
      properties: Object.assign({}, marker, { tooltipContent: tooltipContent }),
    };
  });
}
function iconClusterOptions(clusterTyp) {
  return {
    maxClusterRadius: 120,
    iconCreateFunction: function (cluster) {
      var markers = cluster.getAllChildMarkers();
      var childCount = markers.length;
      var typ = cluster.getAllChildMarkers()[0].feature.properties.typ;
      var clusterClass = 'leaflet-marker-icon marker-cluster leaflet-zoom-animated leaflet-interactive'
      var icon = iconsByTypProp[typ].options.html;
      return L.divIcon({
        html: '<div><span>' + childCount + ' ' + icon + '</span></div>',
        className: clusterClass + ' marker-cluster-' + typ,
        iconSize: L.point(40, 40),
      });
    },
    polygonOptions: {
      className: 'blurredPolygon',
      stroke: false,
      fillColor: colorByTyp[clusterTyp],
      fillOpacity: 1,
    },
  };
}

/** function to add an svg blur to the polygons that show up when the clusters are hovered over */
function addSVGBlurToPolygons(basemap) {
  // must add a polygon to the map for the overlay layer to be created,
  // so add a random one to the north pole somewhere out of view
  var someLineIntheNorthPole = [[-126.562500,84.802474],[-122.343750,84.802474]];
  var polygon = L.polygon(someLineIntheNorthPole).addTo(basemap.leafletmap());

  var svg = basemap.leafletmap().getPanes().overlayPane.firstChild;
  var svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  var svgBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');

  svgFilter.setAttribute('id', 'blur');
  svgFilter.setAttribute('x', '-100%');
  svgFilter.setAttribute('y', '-100%');
  svgFilter.setAttribute('width', '500%');
  svgFilter.setAttribute('height', '500%');
  svgBlur.setAttribute('stdDeviation', 5);

  svgFilter.appendChild(svgBlur);
  svg.appendChild(svgFilter);
}

window.onload = function() {
  var basemap = window.basemap = new LeafletBasemap({ mapDivId: 'mapContainer', layersControlOptions: { collapsed: false } })
    .addESRIWorldImageryBaseMapLayer()
    .addESRIOceanBaseMapLayer();

  addSVGBlurToPolygons(basemap);

  // navigational charts, will be transparent and always as an optional overlay
  var navCharts = L.esri.imageMapLayer({
    url: 'https://seamlessrnc.nauticalcharts.noaa.gov/arcgis/rest/services/RNC/NOAA_RNC/ImageServer',
    opacity: 0.35,
    transparent: true,
    zindex: 2
  });

  // add this layer to the layer control (checkboxes to toggle layers)
  basemap.layerControl().addOverlay(navCharts, "Navigational Charts");

  // fetch the markers
  $.ajax({
    type: "GET",
    url: "resources/markers.xml",
    dataType: "xml",
    success: function (xml) {
      // parse xml and convert the markers to an array of objects with just the
      // properties defined in the xml
      var markerObjectsArray = xmlToJson(xml).markers.marker.map(function (marker) {
        return marker['@attributes'];
      });

      // group markers by type (or typ) as the property is called in the xml
      var markersByLayer = markerObjectsArray.reduce(function(acc, marker) {
        if (!acc[marker.typ]) {
          acc[marker.typ] = [];
        }
        acc[marker.typ].push(marker);
        return acc;
      }, {});

      // iterate over the layers and build the leaflet map layers
      var bounds = L.latLngBounds([]);
      Object.keys(markersByLayer).forEach(function (layerKey) {
        // for each layer, convert all marker objects to GeoJson format
        var layerGeoJson = markersToGeojsonArray(markersByLayer[layerKey]);

        // create a leaflet layer from the GeoJson for each layer
        var thisLayer = L.geoJson(
          layerGeoJson,
          layerGeoJsonOptions
          );

        // build the marker clusterer
        var clusterOptions = Object.assign({}, iconClusterOptions(layerKey), { typ: layerKey });
        var cluster = L.markerClusterGroup(clusterOptions);
        cluster.addLayer(thisLayer);

        basemap.leafletmap().addLayer(cluster);

        // update the bounds so we can zoom to fit the layers
        var layerBounds = thisLayer.getBounds();
        bounds.extend(layerBounds);

        // add this layer to the layer control (checkboxes to toggle layers)
        basemap.layerControl().addOverlay(cluster, typLabel[layerKey] + ' ' + iconsByTypProp[layerKey].options.html);
      });

      // zoom to the bounds of all layers
      basemap.leafletmap().fitBounds(bounds);
    }
  });
}

