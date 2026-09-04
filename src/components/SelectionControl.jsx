import { useId } from "react";

/* Wiederverwendbare semantische Checkbox fuer Karten und kompakte Zeilen.
   Die sichtbare Checkbox darf klein bleiben; `.kd-selection-control-hitbox`
   ist die gemeinsame, spaeter global auf mindestens 44px stylbare Hitbox. */
export function SelectionControl({
  id,
  checked,
  defaultChecked,
  disabled = false,
  label,
  description = null,
  name,
  value,
  onChange,
  onCheckedChange,
  className = "",
  inputClassName = "",
  inputProps = {},
}) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = id || `kd-selection-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const controlled = typeof checked === "boolean";
  const change = (event) => {
    onChange?.(event);
    onCheckedChange?.(event.currentTarget.checked, event);
  };
  return (
    <label
      htmlFor={inputId}
      className={`kd-selection-control kd-selection-control-hitbox kd-touch-checkbox ${className}`.trim()}
      data-selection-control="checkbox"
    >
      <input
        {...inputProps}
        id={inputId}
        type="checkbox"
        name={name}
        value={value}
        disabled={disabled}
        {...(controlled ? { checked } : { defaultChecked })}
        onChange={change}
        aria-describedby={descriptionId}
        className={`kd-selection-control-input ${inputClassName}`.trim()}
      />
      <span className="kd-selection-control-text">
        <span className="kd-selection-control-label">{label}</span>
        {description ? <span id={descriptionId} className="kd-selection-control-description">{description}</span> : null}
      </span>
    </label>
  );
}
