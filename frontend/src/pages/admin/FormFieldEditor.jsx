import { Trash2 } from 'lucide-react';

const normalizeFieldIdentity = (field, index) => {
  const key = typeof field.key === 'string' ? field.key.trim() : '';
  return key || `field-${index + 1}`;
};

const toDomIdSegment = (value) => {
  const normalized = value
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'unnamed';
};

export const getFieldEditorKey = (field, index) => normalizeFieldIdentity(field, index);

export default function FormFieldEditor({
  editorKey,
  field,
  index,
  fieldTypes,
  canRemove,
  onUpdate,
  onRemove,
}) {
  const identity = normalizeFieldIdentity(field, index);
  const stableDomId = toDomIdSegment(editorKey || identity);
  const fieldBaseId = `form-field-${toDomIdSegment(identity)}-${stableDomId}`;
  const label = field.label || 'Untitled field';
  const fieldKey = field.key || 'No key';
  const labelClass = 'admin-muted mb-2 block min-w-0 break-words text-sm font-medium';
  const inputClass = 'input min-w-0';

  return (
    <div className="admin-card min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-lg font-semibold text-[#f7efe3]">
              Field {index + 1}
            </h3>
            <span className="admin-chip max-w-full truncate border-white/10 bg-white/[0.04] text-[#aaa096] normal-case tracking-normal">
              {fieldKey}
            </span>
            <span className="admin-chip shrink-0 border-[#E23744]/20 bg-[#E23744]/10 text-[#f2e7d8]">
              {field.type}
            </span>
          </div>
          <p className="admin-muted mt-2 min-w-0 break-words text-sm">
            {label}
          </p>
        </div>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="admin-icon-button shrink-0 hover:border-[#E23744]/40 hover:bg-[#E23744] hover:text-white"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${fieldBaseId}-key`} className={labelClass}>
            Field Key (unique identifier)
          </label>
          <input
            id={`${fieldBaseId}-key`}
            type="text"
            value={field.key}
            onChange={(event) => onUpdate({ key: event.target.value })}
            className={inputClass}
            disabled={index < 2}
          />
        </div>

        <div className="min-w-0">
          <label htmlFor={`${fieldBaseId}-type`} className={labelClass}>
            Field Type
          </label>
          <select
            id={`${fieldBaseId}-type`}
            value={field.type}
            onChange={(event) => onUpdate({ type: event.target.value })}
            className={inputClass}
          >
            {fieldTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label htmlFor={`${fieldBaseId}-label`} className={labelClass}>
            Field Label
          </label>
          <input
            id={`${fieldBaseId}-label`}
            type="text"
            value={field.label}
            onChange={(event) => onUpdate({ label: event.target.value })}
            className={inputClass}
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor={`${fieldBaseId}-required`}
            className="mt-8 flex min-w-0 items-center gap-2"
          >
            <input
              id={`${fieldBaseId}-required`}
              type="checkbox"
              checked={field.required}
              onChange={(event) => onUpdate({ required: event.target.checked })}
              className="rounded border-white/10 bg-[#151311] text-[#E23744] focus:ring-[#E23744]"
            />
            <span className="min-w-0 break-words text-sm font-medium text-[#d9d0c6]">
              Required
            </span>
          </label>
        </div>
      </div>

      {field.type === 'select' && (
        <div className="mt-4 min-w-0">
          <label htmlFor={`${fieldBaseId}-options`} className={labelClass}>
            Options (comma-separated)
          </label>
          <input
            id={`${fieldBaseId}-options`}
            type="text"
            value={field.options?.join(', ') || ''}
            onChange={(event) =>
              onUpdate({
                options: event.target.value.split(',').map((option) => option.trim()).filter(Boolean)
              })
            }
            className={inputClass}
            placeholder="Option 1, Option 2, Option 3"
          />
        </div>
      )}
    </div>
  );
}
