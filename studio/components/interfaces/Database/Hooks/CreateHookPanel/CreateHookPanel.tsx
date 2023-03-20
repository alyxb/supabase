import Image from 'next/image'
import { useState, useRef, useEffect } from 'react'
import { Button, SidePanel, Form, Input, Listbox, Checkbox, Radio, Badge } from 'ui'

import { useStore } from 'hooks'
import { uuidv4 } from 'lib/helpers'
import HTTPRequestFields from './HTTPRequestFields'
import { FormSection, FormSectionLabel, FormSectionContent } from 'components/ui/Forms'
import { useDatabaseTriggerCreateMutation } from 'data/database-triggers/database-trigger-create-mutation'
import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'

export interface CreateHookPanelProps {
  visible: boolean
  onClose: () => void
}

export type HTTPArgument = { id: string; name: string; value: string }

const CreateHookPanel = ({ visible, onClose }: CreateHookPanelProps) => {
  // [Joshen] Need to change to use RQ once Alaister's PR goes in
  const { meta, ui } = useStore()
  const submitRef: any = useRef()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // [Joshen] There seems to be some bug between Checkbox.Group within the Form component
  // hence why this external state as a temporary workaround
  const [events, setEvents] = useState<string[]>([])
  const [eventsError, setEventsError] = useState<string>()

  // For HTTP request
  const [httpHeaders, setHttpHeaders] = useState<HTTPArgument[]>([])
  const [httpParameters, setHttpParameters] = useState<HTTPArgument[]>([])

  const { project } = useProjectContext()
  const { mutateAsync: createDatabaseTrigger } = useDatabaseTriggerCreateMutation()

  useEffect(() => {
    if (visible) {
      // Reset form fields outside of the Form context
      setEvents([])
      setHttpHeaders([{ id: uuidv4(), name: 'Content-type', value: 'application/json' }])
      setHttpParameters([{ id: uuidv4(), name: '', value: '' }])
    }
  }, [visible])

  const tables = meta.tables.list()

  const initialValues = {
    name: '',
    table_id: 0,
    enabled_mode: 'ORIGIN',
    function_name: 'http_request',

    http_method: '',
    http_url: '',
  }

  const onUpdateSelectedEvents = (event: string) => {
    if (events.includes(event)) {
      setEvents(events.filter((e) => e !== event))
    } else {
      setEvents(events.concat(event))
    }
    setEventsError(undefined)
  }

  const validate = (values: any) => {
    const errors: any = {}

    if (!values.name) {
      errors['name'] = 'Please provide a name for your webhook'
    }
    if (!values.table_id) {
      errors['table_id'] = 'Please select a table for which your webhook will trigger from'
    }

    if (values.function_name === 'http_request') {
      // For HTTP requests
      if (!values.http_url) {
        errors['http_url'] = 'Please provide a URL'
      } else if (!values.http_url.startsWith('http')) {
        errors['http_url'] = 'Please include HTTP/HTTPs to your URL'
      }
    } else if (values.function_name === 'supabase_function') {
      // For Supabase Edge Functions
    }

    return errors
  }

  const onSubmit = async (values: any) => {
    if (!project?.ref) {
      return console.error('Project ref is required')
    }
    if (events.length === 0) {
      return setEventsError('Please select at least one event')
    }

    const selectedTable = meta.tables.byId(values.table_id)
    if (!selectedTable) {
      return ui.setNotification({ category: 'error', message: 'Unable to find selected table' })
    }

    const payload: any = {
      events,
      activation: 'AFTER',
      orientation: 'ROW',
      name: values.name,
      table: selectedTable.name,
      schema: selectedTable.schema,
      table_id: values.table_id,
      enabled_mode: values.enabled_mode,
      function_name: values.function_name,
      function_schema: 'supabase_functions',
      function_args: [],
    }

    if (values.function_name === 'http_request') {
      const serviceTimeoutMs = '1000'
      const headers = httpHeaders.reduce((a: any, b: any) => {
        a[b.name] = b.value
        return a
      }, {})
      const parameters = httpParameters.reduce((a: any, b: any) => {
        a[b.name] = b.value
        return a
      }, {})
      payload.function_args = [
        values.http_url,
        values.http_method,
        JSON.stringify(headers),
        JSON.stringify(parameters),
        serviceTimeoutMs,
      ]
    } else if (values.function_name === 'supabase_function') {
      payload.function_args = []
    }

    try {
      setIsSubmitting(true)
      await createDatabaseTrigger({
        projectRef: project?.ref,
        connectionString: project?.connectionString,
        payload,
      })
      ui.setNotification({
        category: 'success',
        message: `Successfully created new webhook "${values.name}"`,
      })
      onClose()
    } catch (error: any) {
      ui.setNotification({
        error,
        category: 'error',
        message: `Failed to create webhook: ${error.message}`,
      })
    } finally {
      setIsSubmitting(true)
    }
  }

  return (
    <SidePanel
      size="xlarge"
      visible={visible}
      header="Create a new database webhook"
      className="hooks-sidepanel mr-0 transform transition-all duration-300 ease-in-out"
      onConfirm={() => {}}
      onCancel={() => onClose()}
      customFooter={
        <div className="flex w-full justify-end space-x-3 border-t border-scale-500 px-3 py-4">
          <Button
            size="tiny"
            type="default"
            htmlType="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="tiny"
            type="primary"
            htmlType="button"
            disabled={isSubmitting}
            loading={isSubmitting}
            onClick={() => submitRef?.current?.click()}
          >
            Create hook
          </Button>
        </div>
      }
    >
      <Form validateOnBlur initialValues={initialValues} onSubmit={onSubmit} validate={validate}>
        {({
          isSubmitting,
          values,
          resetForm,
        }: {
          isSubmitting: boolean
          values: any
          resetForm: any
        }) => {
          return (
            <div>
              <FormSection
                header={<FormSectionLabel className="lg:!col-span-4">General</FormSectionLabel>}
              >
                <FormSectionContent loading={false} className="lg:!col-span-8">
                  <Input id="name" name="name" label="Name" />
                </FormSectionContent>
              </FormSection>
              <SidePanel.Separator />
              <FormSection
                header={
                  <FormSectionLabel
                    className="lg:!col-span-4"
                    description={
                      <p className="text-sm text-scale-1000">
                        Select which table and events will trigger your function hook
                      </p>
                    }
                  >
                    Conditions to fire hook
                  </FormSectionLabel>
                }
              >
                <FormSectionContent loading={false} className="lg:!col-span-8">
                  <Listbox
                    size="medium"
                    id="table_id"
                    name="table_id"
                    label="Table"
                    descriptionText="This is the table the trigger will watch for changes. You can only select 1 table for a trigger."
                  >
                    <Listbox.Option
                      key={'table-no-selection'}
                      id={'table-no-selection'}
                      label={'---'}
                      value={'no-selection'}
                    >
                      ---
                    </Listbox.Option>
                    {tables.map((table) => (
                      <Listbox.Option
                        key={table.id}
                        id={table.id.toString()}
                        value={table.id}
                        label={table.name}
                      >
                        <div className="flex items-center space-x-2">
                          <p>{table.name}</p>
                          <p className="text-scale-1100">{table.schema}</p>
                        </div>
                      </Listbox.Option>
                    ))}
                  </Listbox>
                  <Checkbox.Group
                    id="events"
                    name="events"
                    label="Events"
                    error={eventsError}
                    descriptionText="These are the events that are watched by the webhook, only the events selected above will fire the webhook on the table you've selected."
                  >
                    <Checkbox
                      value="INSERT"
                      label="Insert"
                      description="Any insert operation on the table"
                      checked={events.includes('INSERT')}
                      onChange={() => onUpdateSelectedEvents('INSERT')}
                    />
                    <Checkbox
                      value="UPDATE"
                      label="Update"
                      description="Any update operation, of any column in the table"
                      checked={events.includes('UPDATE')}
                      onChange={() => onUpdateSelectedEvents('UPDATE')}
                    />
                    <Checkbox
                      value="DELETE"
                      label="Delete"
                      description="Any deletion of a record"
                      checked={events.includes('DELETE')}
                      onChange={() => onUpdateSelectedEvents('DELETE')}
                    />
                  </Checkbox.Group>
                </FormSectionContent>
              </FormSection>
              <SidePanel.Separator />
              <FormSection
                header={
                  <FormSectionLabel className="lg:!col-span-4">Hook configuration</FormSectionLabel>
                }
              >
                <FormSectionContent loading={false} className="lg:!col-span-8">
                  <Radio.Group
                    id="function_name"
                    name="function_name"
                    label="Type of hook"
                    type="cards"
                  >
                    <Radio
                      id="http_request"
                      value="http_request"
                      label=""
                      beforeLabel={
                        <>
                          <div className="flex items-center space-x-5">
                            <Image
                              src={`/img/function-providers/http-request.png`}
                              layout="fixed"
                              width="32"
                              height="32"
                            />
                            <div className="flex-col space-y-0">
                              <div className="flex space-x-1">
                                <span className="text-scale-1200">HTTP Request</span>
                                <Badge color="green">Alpha</Badge>
                              </div>
                              <span className="text-scale-900">
                                Send an HTTP request to any URL.
                              </span>
                            </div>
                          </div>
                        </>
                      }
                    />
                    <Radio
                      disabled
                      id="supabase_function"
                      value="supabase_function"
                      label=""
                      beforeLabel={
                        <>
                          <div className="flex items-center space-x-5">
                            <Image
                              src={`/img/function-providers/supabase-severless-function.png`}
                              layout="fixed"
                              width="32"
                              height="32"
                            />
                            <div className="flex-col space-y-0">
                              <div className="flex space-x-1">
                                <span className="text-scale-1200">Supabase Edge Functions</span>
                                <Badge color="amber">Coming soon</Badge>
                              </div>
                              <span className="text-scale-900">
                                Choose a Supabase Function to run.
                              </span>
                            </div>
                          </div>
                        </>
                      }
                    />
                  </Radio.Group>
                </FormSectionContent>
              </FormSection>
              <SidePanel.Separator />

              <HTTPRequestFields
                httpHeaders={httpHeaders}
                httpParameters={httpParameters}
                onAddHeader={() =>
                  setHttpHeaders(httpHeaders.concat({ id: uuidv4(), name: '', value: '' }))
                }
                onUpdateHeader={(idx, property, value) =>
                  setHttpHeaders(
                    httpHeaders.map((header, i) => {
                      if (idx === i) return { ...header, [property]: value }
                      else return header
                    })
                  )
                }
                onRemoveHeader={(idx) => setHttpHeaders(httpHeaders.filter((_, i) => idx !== i))}
                onAddParameter={() =>
                  setHttpParameters(httpParameters.concat({ id: uuidv4(), name: '', value: '' }))
                }
                onUpdateParameter={(idx, property, value) =>
                  setHttpParameters(
                    httpParameters.map((param, i) => {
                      if (idx === i) return { ...param, [property]: value }
                      else return param
                    })
                  )
                }
                onRemoveParameter={(idx) =>
                  setHttpParameters(httpParameters.filter((_, i) => idx !== i))
                }
              />

              <button ref={submitRef} type="submit" className="hidden" />
            </div>
          )
        }}
      </Form>
    </SidePanel>
  )
}

export default CreateHookPanel