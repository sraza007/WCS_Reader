/** @jsx jsx */
import { React, jsx } from 'jimu-core'
import { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Label } from 'jimu-ui'

const Setting = (props: AllWidgetSettingProps<any>) => {
  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds: useMapWidgetIds
    })
  }

  const onWcsUrlChange = (value: string) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('wcsUrl', value)
    })
  }

  const onLayerNameChange = (value: string) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('layerName', value)
    })
  }

  const onSamplePointsChange = (value: number) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('samplePoints', value)
    })
  }

  return (
    <div className="widget-setting-WCS-Reader p-3">
      <SettingSection title="Map Selection">
        <SettingRow>
          <Label>Select Map</Label>
          <MapWidgetSelector 
            useMapWidgetIds={props.useMapWidgetIds} 
            onSelect={onMapWidgetSelected} 
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="GeoServer WCS Settings">
        <SettingRow label="WCS Base URL">
          <TextInput 
            value={props.config?.wcsUrl || ''} 
            onChange={(e) => onWcsUrlChange(e.target.value)}
            placeholder="https://your-geoserver/wcs"
          />
        </SettingRow>
        <SettingRow label="Layer Name">
          <TextInput 
            value={props.config?.layerName || ''} 
            onChange={(e) => onLayerNameChange(e.target.value)}
            placeholder="workspace:layer_name"
          />
        </SettingRow>
        <SettingRow label="Sample Points">
          <NumericInput 
            value={props.config?.samplePoints || 50} 
            onChange={onSamplePointsChange}
            min={10}
            max={200}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

export default Setting
