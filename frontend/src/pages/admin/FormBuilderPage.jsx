import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';
import useConfirmDialog from '../../hooks/useConfirmDialog';
import FormFieldEditor, { getFieldEditorKey } from './FormFieldEditor';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Text Area' }
];

const DEFAULT_FIELDS = [
  { key: 'name', type: 'text', label: 'Full Name', required: true },
  { key: 'email', type: 'email', label: 'Email', required: true },
  { key: 'phone', type: 'tel', label: 'Phone Number', required: false }
];

const serializeFields = (value) => JSON.stringify(value);

const createFieldEditorKeys = (fieldList) => {
  const seen = new Map();

  return fieldList.map((field, index) => {
    const baseKey = getFieldEditorKey(field, index);
    const count = seen.get(baseKey) || 0;
    seen.set(baseKey, count + 1);

    return count === 0 ? baseKey : `${baseKey}-${count + 1}`;
  });
};

export default function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [fieldEditorKeys, setFieldEditorKeys] = useState(() => createFieldEditorKeys(DEFAULT_FIELDS));
  const [initialSnapshot, setInitialSnapshot] = useState(serializeFields(DEFAULT_FIELDS));
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    fetchForm();
  }, [id]);

  const hasUnsavedChanges = serializeFields(fields) !== initialSnapshot;

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const fetchForm = async () => {
    setFetchLoading(true);
    setFetchError('');

    try {
      const response = await api.get(`/admin/events/${id}`);
      const savedFields = response.data?.form?.schemaJson?.fields;
      const nextFields = Array.isArray(savedFields) && savedFields.length > 0
        ? savedFields
        : DEFAULT_FIELDS;

      setFields(nextFields);
      setFieldEditorKeys(createFieldEditorKeys(nextFields));
      setInitialSnapshot(serializeFields(nextFields));
    } catch (error) {
      setFetchError(error.response?.data?.error || 'Failed to load this event form');
    } finally {
      setFetchLoading(false);
    }
  };

  const addField = () => {
    const newField = {
      key: `field_${Date.now()}`,
      type: 'text',
      label: 'New Field',
      required: false,
      options: []
    };

    setFields((currentFields) => [...currentFields, newField]);
    setFieldEditorKeys((currentKeys) => [
      ...currentKeys,
      getFieldEditorKey(newField, currentKeys.length)
    ]);
  };

  const updateField = (index, updates) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields((currentFields) => currentFields.filter((_, i) => i !== index));
    setFieldEditorKeys((currentKeys) => currentKeys.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      const schemaJson = {
        title: 'Registration Form',
        fields: fields.map(field => ({
          ...field,
          options: field.type === 'select' ? field.options : undefined
        }))
      };

      await api.post(`/admin/events/${id}/form`, { schemaJson });
      setInitialSnapshot(serializeFields(schemaJson.fields));
      toast.success('Form saved successfully!');
      navigate('/admin/events');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save form');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: 'Discard form changes?',
        message: 'Unsaved registration fields will be lost.',
        confirmLabel: 'Discard changes',
        tone: 'warning',
      });
      if (!confirmed) return;
    }
    navigate('/admin/events');
  };

  if (fetchLoading) {
    return <LoadingBlock title="Loading form" message="Fetching the saved registration schema." />;
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Could not load form"
        message={fetchError}
        action={(
          <button type="button" onClick={fetchForm} className="admin-primary-action inline-flex">
            Retry
          </button>
        )}
      />
    );
  }

  return (
    <div className="max-w-4xl min-w-0">
      {dialog}
      <div className="mb-8 min-w-0">
        <h1 className="break-words text-3xl font-bold text-[#f7efe3]">Form Builder</h1>
      </div>

      <div className="space-y-6">
        {fields.map((field, index) => (
          <FormFieldEditor
            key={fieldEditorKeys[index] || getFieldEditorKey(field, index)}
            editorKey={fieldEditorKeys[index] || getFieldEditorKey(field, index)}
            field={field}
            index={index}
            fieldTypes={FIELD_TYPES}
            canRemove={fields.length > 2}
            onUpdate={(updates) => updateField(index, updates)}
            onRemove={() => removeField(index)}
          />
        ))}

        <button
          type="button"
          onClick={addField}
          className="admin-primary-action flex w-full items-center justify-center"
        >
          <Plus size={20} className="mr-2" />
          Add Field
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="admin-primary-action inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Form'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#d9d0c6] transition-all hover:border-[#f2e7d8]/30 hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0a09]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
