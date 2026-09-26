import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { For } from "solid-js"
import "./form-select.css"

// Select trigger styled like a form text field. The dropdown is a standard menu
// surface that sizes to its options instead of the trigger width.
export function FormSelect(props: {
  options: Array<{ value: string; label: string }>
  current?: string
  onSelect: (value: string) => void
  placeholder?: string
  disabled?: boolean
  label?: string
}) {
  const selected = () => props.options.find((option) => option.value === props.current)
  return (
    <Menu gutter={6} modal={false} placement="bottom-start">
      <Menu.Trigger
        class="form-select-trigger"
        data-component="form-select"
        disabled={props.disabled}
        aria-label={props.label}
      >
        <span data-slot="form-select-value" data-placeholder={!selected() ? "" : undefined}>
          {selected()?.label ?? props.placeholder}
        </span>
        <Icon name="chevron-down" size="small" data-slot="form-select-chevron" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content class="form-select-content">
          <Menu.RadioGroup value={props.current} onChange={(value) => props.onSelect(value)}>
            <For each={props.options}>
              {(option) => (
                <Menu.RadioItem value={option.value} closeOnSelect>
                  {option.label}
                </Menu.RadioItem>
              )}
            </For>
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
