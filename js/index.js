
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

// lookup of type (site, access) -> icon to represent the type
var iconsByTypProp = {
  site: new L.Icon({
    iconSize: [27, 27],
    iconAnchor: [13, 27],
    popupAnchor: [1, -24],
    iconUrl: 'resources/icons8-camping-tent-50.png'
  }),
  access: new L.Icon({
    iconSize: [27, 27],
    iconAnchor: [13, 27],
    popupAnchor: [1, -24],
    iconUrl: 'resources/water-access-icon.png'
  }),
};

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

window.onload = function() {
  var basemap = new LeafletBasemap({ mapDivId: 'mapContainer' })
    .addESRIWorldImageryBaseMapLayer()
    .addESRIOceanBaseMapLayer();

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
        ).addTo(basemap.leafletmap());

        // update the bounds so we can zoom to fit the layers
        var layerBounds = thisLayer.getBounds();
        bounds.extend(layerBounds);

        // add this layer to the layer control (checkboxes to toggle layers)
        basemap.layerControl().addOverlay(thisLayer, layerKey);
      });
      // zoom to the bounds of all layers
      basemap.leafletmap().fitBounds(bounds);
    }
  });
}

