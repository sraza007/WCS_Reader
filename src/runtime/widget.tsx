/** @jsx jsx */
import { React, jsx, AllWidgetProps, getAppStore } from 'jimu-core';
import { JimuMapViewComponent, JimuMapView } from 'jimu-arcgis';
import { Button, Loading, LoadingType, Select, Option } from 'jimu-ui';
import { IMConfig } from '../config';
import Sketch from 'esri/widgets/Sketch';
import GraphicsLayer from 'esri/layers/GraphicsLayer';
import * as geometryEngine from 'esri/geometry/geometryEngine';
import Point from 'esri/geometry/Point';
import Polyline from 'esri/geometry/Polyline';
import webMercatorUtils from 'esri/geometry/support/webMercatorUtils';
import './style.css';

interface WCSLayerInfo {
  id: string;
  title: string;
  url: string;
  coverageId: string;
}

interface State {
  jimuMapView: JimuMapView;
  profileData: any[];
  isCalculating: boolean;
  error: string;
  wcsLayers: WCSLayerInfo[];
  selectedLayerId: string;
}

const SVGProfileChart = (props: { data: any[] }) => {
  const { data } = props;
  if (!data || data.length < 2) return null;

  const width = 400; 
  const height = 150; 
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const xMax = data[data.length - 1].distance || 1;
  const yValues = data.map(d => d.elevation);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const yRange = yMax - yMin || 1;

  const getX = (d: number) => padding.left + (d / xMax) * (width - padding.left - padding.right);
  const getY = (v: number) => height - padding.bottom - ((v - yMin) / yRange) * (height - padding.top - padding.bottom);

  let pathData = `M ${getX(data[0].distance)} ${getY(data[0].elevation)}`;
  data.forEach((d, i) => {
    if (i > 0) pathData += ` L ${getX(d.distance)} ${getY(d.elevation)}`;
  });

  const areaData = pathData + ` L ${getX(data[data.length - 1].distance)} ${height - padding.bottom} L ${getX(data[0].distance)} ${height - padding.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="svgGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#00d2ff" stopOpacity={0.8} />
          <stop offset="95%" stopColor="#00d2ff" stopOpacity={0.1} />
        </linearGradient>
      </defs>
      
      {[0, 0.25, 0.5, 0.75, 1].map(r => (
        <line 
          key={r}
          x1={padding.left} 
          y1={height - padding.bottom - r * (height - padding.top - padding.bottom)} 
          x2={width - padding.right} 
          y2={height - padding.bottom - r * (height - padding.top - padding.bottom)} 
          stroke="rgba(255,255,255,0.1)" 
          strokeDasharray="4 2"
        />
      ))}

      <path d={areaData} fill="url(#svgGradient)" />
      <path d={pathData} fill="none" stroke="#00d2ff" strokeWidth="2" />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#888" />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#888" />
      <text x={width / 2} y={height - 5} fill="#888" fontSize="10" textAnchor="middle">Distance (m)</text>
      <text x={10} y={height / 2} fill="#888" fontSize="10" textAnchor="middle" transform={`rotate(-90 10 ${height / 2})`}>Value</text>
      <text x={padding.left - 5} y={padding.top + 5} fill="#888" fontSize="8" textAnchor="end">{yMax.toFixed(1)}</text>
      <text x={padding.left - 5} y={height - padding.bottom} fill="#888" fontSize="8" textAnchor="end">{yMin.toFixed(1)}</text>
      <text x={padding.left} y={height - padding.bottom + 12} fill="#888" fontSize="8" textAnchor="middle">0</text>
      <text x={width - padding.right} y={height - padding.bottom + 12} fill="#888" fontSize="8" textAnchor="middle">{xMax.toFixed(0)}</text>
    </svg>
  );
};

export default class Widget extends React.PureComponent<AllWidgetProps<IMConfig>, State> {
  sketchWidget: Sketch = null;
  graphicsLayer: GraphicsLayer = null;
  layersChangeHandle: any = null;

  constructor(props) {
    super(props);
    this.state = {
      jimuMapView: null,
      profileData: [],
      isCalculating: false,
      error: '',
      wcsLayers: [],
      selectedLayerId: ''
    };
  }

  componentDidUpdate(prevProps: AllWidgetProps<IMConfig>) {
    if (prevProps.config !== this.props.config) {
      this.findWcsLayers();
    }
  }

  componentWillUnmount() {
    if (this.layersChangeHandle && this.layersChangeHandle.remove) {
      try { this.layersChangeHandle.remove(); } catch (_e) {}
      this.layersChangeHandle = null;
    }
  }

  findWcsLayers = () => {
    const jmv = this.state.jimuMapView;
    const config = this.props.config;
    const configWcsUrl = config?.wcsUrl;
    const configLayerName = config?.layerName;

    const wcsLayers: WCSLayerInfo[] = [];

    // 1. Add configured default layer if present
    if (configWcsUrl && configLayerName) {
      wcsLayers.push({
        id: 'config-default',
        title: `Default Config (${configLayerName})`,
        url: configWcsUrl,
        coverageId: configLayerName
      });
    }

    // 2. Scan map layers
    if (jmv && jmv.view && jmv.view.map) {
      const walk = (layer: any) => {
        if (!layer) return;
        if (layer.layers && layer.layers.forEach) {
          layer.layers.forEach(walk);
        }
        
        const type = layer.type ? String(layer.type).toLowerCase() : '';
        const url = layer.url ? String(layer.url) : '';
        
        if (type === 'wcs' || url.toLowerCase().includes('/wcs')) {
          wcsLayers.push({
            id: layer.id,
            title: `${layer.title || layer.id} (Map Layer)`,
            url: url,
            coverageId: layer.coverageId || layer.coverage || ''
          });
        }
      };
      
      jmv.view.map.layers.forEach(walk);
    }

    this.setState(prevState => {
      let selectedLayerId = prevState.selectedLayerId;
      if (wcsLayers.length > 0) {
        const stillExists = wcsLayers.some(l => l.id === selectedLayerId);
        if (!stillExists) {
          selectedLayerId = wcsLayers[0].id;
        }
      } else {
        selectedLayerId = '';
      }
      return { wcsLayers, selectedLayerId };
    });
  };

  onActiveViewChange = (jimuMapView: JimuMapView) => {
    if (!jimuMapView) return;
    
    console.log('WCS Reader: Map view connected.', jimuMapView);

    if (this.layersChangeHandle && this.layersChangeHandle.remove) {
      try { this.layersChangeHandle.remove(); } catch (_e) {}
      this.layersChangeHandle = null;
    }

    this.setState({ jimuMapView }, () => {
      this.findWcsLayers();
      if (jimuMapView.view && jimuMapView.view.map && jimuMapView.view.map.layers) {
        try {
          this.layersChangeHandle = jimuMapView.view.map.layers.on('change', this.findWcsLayers);
        } catch (_e) {
          console.warn('WCS Reader: Failed to register layer change listener.');
        }
      }
    });

    try {
      if (!GraphicsLayer || !Sketch) {
        throw new Error('ArcGIS Maps SDK modules (GraphicsLayer/Sketch) not loaded.');
      }

      // Initialize Graphics Layer
      this.graphicsLayer = new GraphicsLayer({ title: "WCS Profile Drawing" });
      jimuMapView.view.map.add(this.graphicsLayer);

      // Initialize Sketch Widget
      this.sketchWidget = new Sketch({
        view: jimuMapView.view,
        layer: this.graphicsLayer,
        creationMode: 'update',
        availableCreateTools: ['polyline']
      });
      console.log('WCS Reader: Sketch widget initialized.');
    } catch (err) {
      console.error('WCS Reader: Failed to initialize map tools.', err);
      this.setState({ error: 'Failed to initialize drawing tools. Please refresh.' });
      return;
    }

    this.sketchWidget.on('create', (event) => {
      if (event.state === 'complete') {
        this.generateProfile(event.graphic.geometry as Polyline);
      }
    });

    this.sketchWidget.on('update', (event) => {
      if (event.state === 'complete') {
        this.generateProfile(event.graphics[0].geometry as Polyline);
      }
    });
  };

  generateProfile = async (polyline: Polyline) => {
    const config = this.props.config;
    let wcsUrl = '';
    let layerName = '';

    const { wcsLayers, selectedLayerId } = this.state;
    const selectedLayer = wcsLayers.find(l => l.id === selectedLayerId);

    if (selectedLayer) {
      wcsUrl = selectedLayer.url;
      layerName = selectedLayer.coverageId;
    } else if (config && config.wcsUrl && config.layerName) {
      wcsUrl = config.wcsUrl;
      layerName = config.layerName;
    }

    if (!wcsUrl || !layerName) {
      this.setState({ error: 'Please select a WCS layer from the dropdown or configure the GeoServer settings.' });
      return;
    }

    const samplePoints = config?.samplePoints || 50;
    this.setState({ isCalculating: true, error: '', profileData: [] });

    const points = Math.max(1, samplePoints);
    try {
      const length = geometryEngine.geodesicLength(polyline, 'meters');
      const data = [];
      
      // Sample points along the line
      for (let i = 0; i <= points; i++) {
        const ratio = i / points;
        const distance = length * ratio;
        const point = this.getPointAtDistance(polyline, distance);
        
        // Fetch value using derived WCS URL and Layer Name
        const value = await this.fetchWcsValue(point, wcsUrl, layerName);
        data.push({
          distance: Math.round(distance),
          elevation: value,
          x: point.x,
          y: point.y
        });
      }

      this.setState({ profileData: data, isCalculating: false });
    } catch (err) {
      console.error(err);
      this.setState({ error: 'Error fetching profile data. Ensure GeoServer CORS is enabled.', isCalculating: false });
    }
  };

  getPointAtDistance = (polyline: Polyline, distance: number): Point => {
    const path = polyline.paths[0];
    let currentDist = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = new Point({ x: path[i][0], y: path[i][1], spatialReference: polyline.spatialReference });
      const p2 = new Point({ x: path[i+1][0], y: path[i+1][1], spatialReference: polyline.spatialReference });
      const segmentDist = geometryEngine.geodesicLength(new Polyline({
        paths: [[path[i], path[i+1]]],
        spatialReference: polyline.spatialReference
      }), 'meters');

      if (currentDist + segmentDist >= distance) {
        const segmentRatio = (distance - currentDist) / segmentDist;
        return new Point({
          x: p1.x + (p2.x - p1.x) * segmentRatio,
          y: p1.y + (p2.y - p1.y) * segmentRatio,
          spatialReference: polyline.spatialReference
        });
      }
      currentDist += segmentDist;
    }
    const lastPoint = path[path.length - 1];
    return new Point({ x: lastPoint[0], y: lastPoint[1], spatialReference: polyline.spatialReference });
  };

  fetchWcsValue = async (point: Point, wcsUrl: string, layerName: string): Promise<number> => {
    // 1. Convert ArcGIS double-underscore layer naming to GeoServer colon notation if present
    const formattedLayerName = layerName.replace('__', ':');

    // 2. Convert Web Mercator (or other Mercator WKIDs like 102100, 102113) to Geographic (EPSG:4326)
    // GeoServer WMS/WCS reliably support EPSG:4326, which also keeps coordinates in valid Long/Lat ranges.
    let queryPoint = point;
    const wkid = point.spatialReference.wkid;
    const isWebMercator = point.spatialReference.isWebMercator || wkid === 3857 || wkid === 102100 || wkid === 102113;
    
    if (isWebMercator && webMercatorUtils) {
      try {
        queryPoint = webMercatorUtils.webMercatorToGeographic(point) as Point;
      } catch (err) {
        console.warn('WCS Reader: Failed to convert Web Mercator coordinates to Geographic:', err);
      }
    }

    const wmsUrl = wcsUrl.replace('/wcs', '/wms');
    
    // Construct GetFeatureInfo URL around queryPoint using EPSG:4326 degrees
    const delta = 0.00001; // degree-based bounding box
    const bbox = `${queryPoint.x - delta},${queryPoint.y - delta},${queryPoint.x + delta},${queryPoint.y + delta}`;
    
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.1.1',
      request: 'GetFeatureInfo',
      layers: formattedLayerName,
      query_layers: formattedLayerName,
      info_format: 'application/json',
      format: 'image/png',
      x: '50',
      y: '50',
      width: '101',
      height: '101',
      srs: 'EPSG:4326',
      bbox: bbox
    });

    const fullUrl = `${wmsUrl}?${params.toString()}`;
    try {
      const response = await fetch(fullUrl);
      if (!response.ok) {
        console.warn('WMS GetFeatureInfo HTTP error:', response.status);
        return this.fetchWcsFallback(queryPoint, wcsUrl, formattedLayerName);
      }
      
      const text = await response.text();
      
      // Check if it's XML (typically starts with '<')
      if (text.trim().startsWith('<')) {
        console.warn('WMS GetFeatureInfo returned XML instead of JSON. Server response:', text.substring(0, 500));
        return this.fetchWcsFallback(queryPoint, wcsUrl, formattedLayerName);
      }
      
      const json = JSON.parse(text);
      if (json.features && json.features.length > 0) {
        // GeoServer returns values in properties. The key name depends on the coverage (usually 'GRAY_INDEX' or band name)
        const properties = json.features[0].properties;
        const val = Object.values(properties)[0]; // Get the first property value
        return typeof val === 'number' ? val : parseFloat(val as string);
      }
    } catch (err) {
      console.warn('Error fetching or parsing WMS GetFeatureInfo:', err);
      return this.fetchWcsFallback(queryPoint, wcsUrl, formattedLayerName);
    }
    return 0;
  };

  fetchWcsFallback = async (point: Point, wcsUrl: string, layerName: string): Promise<number> => {
    // WCS 2.0.1 Subsetting request
    // point is guaranteed to be projected to WGS84 (EPSG:4326) inside fetchWcsValue before calling fallback
    const params = new URLSearchParams({
      service: 'WCS',
      version: '2.0.1',
      request: 'GetCoverage',
      coverageId: layerName,
      subsettingCRS: 'http://www.opengis.net/def/crs/EPSG/0/4326',
      format: 'application/arcgrid' // Use ArcGrid ASCII format (universally supported, simple to parse text)
    });

    // In WCS 2.0.1 KVP encoding, each subsetting dimension must be added as its own 'subset' parameter.
    params.append('subset', `Long(${point.x})`);
    params.append('subset', `Lat(${point.y})`);

    const fullUrl = `${wcsUrl}?${params.toString()}`;
    try {
      const response = await fetch(fullUrl);
      if (!response.ok) {
        console.warn('WCS GetCoverage HTTP error:', response.status);
        return 0;
      }
      
      const text = await response.text();
      if (text.trim().startsWith('<')) {
        console.warn('WCS GetCoverage returned XML instead of ArcGrid. Server response:', text.substring(0, 500));
        return 0;
      }
      
      // Parse ArcGrid format (plain text ASCII grid)
      // Example structure:
      // ncols         1
      // nrows         1
      // xllcorner     -121.63
      // yllcorner     45.12
      // cellsize      0.0001
      // NODATA_value  -9999
      // 124.5
      const lines = text.trim().split(/\s+/);
      const valText = lines[lines.length - 1];
      const val = parseFloat(valText);
      return isNaN(val) || val === -9999 ? 0 : val;
    } catch (e) {
      console.warn('Error fetching or parsing WCS GetCoverage:', e);
      return 0;
    }
  };

  startDrawing = () => {
    if (this.sketchWidget) {
      this.graphicsLayer.removeAll();
      this.sketchWidget.create('polyline');
    } else {
      const errorMsg = !this.props.useMapWidgetIds || this.props.useMapWidgetIds.length === 0 
        ? 'Please select a Map in the widget settings first.' 
        : 'Map is still loading. Please wait a moment.';
      this.setState({ error: errorMsg });
      console.warn('WCS Reader: Sketch widget not initialized.', errorMsg);
    }
  };

  render() {
    const { profileData, isCalculating, error, jimuMapView, wcsLayers, selectedLayerId } = this.state;
    const config = this.props.config;
    const useMapWidgetId = this.props.useMapWidgetIds?.[0];
    const isMapConnected = !!jimuMapView;

    return (
      <div className="widget-WCS-Reader jimu-widget p-3" style={{ overflow: 'auto', background: '#1a1a1a', color: '#fff', borderRadius: '12px', height: '100%' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 style={{ margin: 0, fontWeight: 600, color: '#00d2ff' }}>Terrain Profile</h5>
          <div className="d-flex align-items-center">
            <div 
              style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: isMapConnected ? '#28a745' : '#dc3545', 
                marginRight: '8px',
                boxShadow: isMapConnected ? '0 0 8px #28a745' : '0 0 8px #dc3545'
              }} 
              title={isMapConnected ? 'Map Connected' : 'Map Disconnected'}
            />
            <Button type="primary" onClick={this.startDrawing} size="sm" style={{ background: 'linear-gradient(45deg, #00d2ff, #3a7bd5)', border: 'none' }}>
              Draw Line
            </Button>
          </div>
        </div>

        {useMapWidgetId && (
          <JimuMapViewComponent useMapWidgetId={useMapWidgetId} onActiveViewChange={this.onActiveViewChange} />
        )}

        {error && <div className="alert alert-danger p-2" style={{ fontSize: '12px' }}>{error}</div>}

        {!config?.wcsUrl && wcsLayers.length === 0 && (
          <div className="alert alert-info p-3" style={{ fontSize: '12px', background: 'rgba(0,210,255,0.05)', border: '1px solid rgba(0,210,255,0.2)', color: '#00d2ff' }}>
            <h6 style={{ fontSize: '14px', fontWeight: 600 }}>Welcome to WCS Profile Reader!</h6>
            <p className="mb-0">To get started, please provide your GeoServer WCS endpoint and layer name in settings, or add a WCS layer to the map.</p>
          </div>
        )}

        {!useMapWidgetId && (
          <div className="alert alert-warning p-2" style={{ fontSize: '11px', background: 'rgba(255,165,0,0.1)', border: '1px solid orange', color: 'orange' }}>
            <strong>Configuration required:</strong> Please select a Map widget in the settings panel.
          </div>
        )}

        {isMapConnected && (
          <div className="mb-3 p-2" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#a0a0a0', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Select WCS Layer for Profile
            </label>
            <Select
              value={selectedLayerId}
              onChange={(e) => this.setState({ selectedLayerId: e.target.value })}
              style={{ width: '100%', background: '#252526', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', fontSize: '13px' }}
              disabled={wcsLayers.length === 0}
            >
              {wcsLayers.length === 0 ? (
                <Option value="">No WCS layers found in webmap</Option>
              ) : (
                wcsLayers.map(l => (
                  <Option key={l.id} value={l.id}>
                    {l.title}
                  </Option>
                ))
              )}
            </Select>
          </div>
        )}

        <div style={{ position: 'relative', height: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
          {isCalculating && <Loading type={LoadingType.Secondary} />}
          
          {!isCalculating && profileData.length > 0 ? (
            <SVGProfileChart data={profileData} />
          ) : (
            <div className="h-100 d-flex align-items-center justify-content-center text-muted">
              {!isCalculating && "Click 'Draw Line' to start"}
            </div>
          )}
        </div>

        {profileData.length > 0 && (
          <div className="mt-3" style={{ fontSize: '11px', color: '#aaa' }}>
            <div className="d-flex justify-content-between">
              <span>Total Length: {profileData[profileData.length - 1].distance}m</span>
              <span>Points sampled: {profileData.length}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
}
