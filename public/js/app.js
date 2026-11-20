import { state } from './state.js';
import { NetworkMap } from './map.js';
import { GanttTimeline } from './gantt.js';
import { KpiPanel } from './kpi.js';
import { InspectorPanel } from './inspector.js';
import { DispatcherPanel } from './dispatcher.js';
import { ControlPanel } from './controls.js';

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Domino Sky Airline Operations Center...');

  // Tooltip element
  const tooltipEl = document.getElementById('global-tooltip');

  // Containers
  const mapContainer = document.getElementById('map-container');
  const ganttContainer = document.getElementById('gantt-container');
  const kpiContainer = document.getElementById('kpi-container');
  const inspectorContainer = document.getElementById('inspector-container');
  const dispatcherContainer = document.getElementById('dispatcher-container');
  const controlsContainer = document.getElementById('controls-container');

  // Instantiate component controllers
  const controls = new ControlPanel(controlsContainer);
  const networkMap = new NetworkMap(mapContainer, tooltipEl);
  const gantt = new GanttTimeline(ganttContainer);
  const kpis = new KpiPanel(kpiContainer);
  const inspector = new InspectorPanel(inspectorContainer);
  const dispatcher = new DispatcherPanel(dispatcherContainer);

  // Initialize central state (fetches network & runs baseline simulation)
  try {
    await state.init();
    controls.render();
    dispatcher.render();
    console.log('Domino Sky initialized successfully. 70 flights loaded across 16 airports.');
  } catch (err) {
    console.error('Failed to initialize Domino Sky:', err);
    document.body.innerHTML = `
      <div style="padding: 40px; color: #ef4444; font-family: monospace;">
        <h2>Initialization Error</h2>
        <p>${err.message}</p>
      </div>
    `;
  }
});
