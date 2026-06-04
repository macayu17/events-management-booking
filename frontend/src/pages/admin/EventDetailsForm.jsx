import { Upload } from 'lucide-react';

function FieldError({ children }) {
  return <p className="mt-1 break-words text-sm text-red-500">{children}</p>;
}

function FormField({ children, error, errorMessage, htmlFor, label }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-2 block break-words text-sm font-bold text-[#d9d0c6]">
        {label}
      </label>
      {children}
      {error && <FieldError>{errorMessage}</FieldError>}
    </div>
  );
}

function PosterPicker({ idPrefix, onPosterChange, onPosterRemove, posterFile, posterPreview }) {
  const inputId = `${idPrefix}-event-poster`;
  const selectedFileName = posterFile?.name;

  return (
    <FormField htmlFor={inputId} label="Event Poster">
      <div className="min-w-0 rounded-2xl border border-dashed border-[#f2e7d8]/25 bg-white/[0.035] p-5 text-center transition-colors hover:border-[#f2e7d8]/40 sm:p-6">
        {posterPreview ? (
          <div className="min-w-0 space-y-4">
            <div className="mx-auto max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#0f0d0b]">
              <img
                src={posterPreview}
                alt="Poster preview"
                className="mx-auto max-h-64 w-full max-w-full object-contain sm:max-h-72"
              />
            </div>
            <div className="mx-auto flex max-w-full flex-col items-center gap-2">
              <span className="admin-chip max-w-full truncate border-[#f2e7d8]/25 bg-[#f2e7d8]/10 text-[#f2e7d8] normal-case tracking-normal">
                {selectedFileName ? 'New poster selected' : 'Poster preview'}
              </span>
              {selectedFileName && (
                <p className="admin-muted max-w-full truncate text-xs" title={selectedFileName}>
                  {selectedFileName}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <label htmlFor={inputId} className="btn btn-secondary cursor-pointer">
                {selectedFileName ? 'Choose different poster' : 'Replace poster'}
              </label>
              {selectedFileName && (
                <button type="button" onClick={onPosterRemove} className="btn btn-ghost">
                  Remove selected poster
                </button>
              )}
            </div>
            <input id={inputId} type="file" accept="image/*" onChange={onPosterChange} className="sr-only" />
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="block min-w-0 cursor-pointer rounded-xl px-3 py-4 transition-colors hover:bg-white/[0.03]"
          >
            <Upload className="mx-auto mb-3 h-12 w-12 text-[#8f867d]" />
            <p className="break-words text-sm font-semibold text-[#d9d0c6]">Click to upload poster image</p>
            <p className="admin-muted mt-1 break-words text-xs">PNG or JPG up to 5MB</p>
            <input id={inputId} type="file" accept="image/*" onChange={onPosterChange} className="sr-only" />
          </label>
        )}
      </div>
    </FormField>
  );
}

export default function EventDetailsForm({
  errors,
  idPrefix,
  onPosterChange,
  onPosterRemove,
  posterFile,
  posterPreview,
  priceDefaultValue,
  register,
  showPlaceholders = false,
}) {
  const placeholders = showPlaceholders
    ? {
        title: 'Annual Tech Conference',
        description: 'Describe your event...',
        location: 'Convention Center, New York',
        capacity: '100',
        price: '0.00 (Free)',
      }
    : {};

  return (
    <div className="admin-card min-w-0 p-5 sm:p-6">
      <h2 className="mb-5 break-words text-xl font-black text-[#f7efe3]">Event details</h2>

      <div className="space-y-4">
        <FormField
          error={errors.title}
          errorMessage="Title is required"
          htmlFor={`${idPrefix}-event-title`}
          label="Event Title *"
        >
          <input
            id={`${idPrefix}-event-title`}
            type="text"
            {...register('title', { required: true })}
            className="input min-w-0"
            placeholder={placeholders.title}
          />
        </FormField>

        <FormField
          error={errors.description}
          errorMessage="Description is required"
          htmlFor={`${idPrefix}-event-description`}
          label="Description *"
        >
          <textarea
            id={`${idPrefix}-event-description`}
            {...register('description', { required: true })}
            className="input min-w-0"
            rows={5}
            placeholder={placeholders.description}
          />
        </FormField>

        <FormField
          error={errors.location}
          errorMessage="Location is required"
          htmlFor={`${idPrefix}-event-location`}
          label="Location *"
        >
          <input
            id={`${idPrefix}-event-location`}
            type="text"
            {...register('location', { required: true })}
            className="input min-w-0"
            placeholder={placeholders.location}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            error={errors.startTime}
            errorMessage="Start time is required"
            htmlFor={`${idPrefix}-event-start-time`}
            label="Start Date & Time *"
          >
            <input
              id={`${idPrefix}-event-start-time`}
              type="datetime-local"
              {...register('startTime', { required: true })}
              className="input min-w-0"
            />
          </FormField>

          <FormField
            error={errors.endTime}
            errorMessage="End time is required"
            htmlFor={`${idPrefix}-event-end-time`}
            label="End Date & Time *"
          >
            <input
              id={`${idPrefix}-event-end-time`}
              type="datetime-local"
              {...register('endTime', { required: true })}
              className="input min-w-0"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            error={errors.capacity}
            errorMessage="Valid capacity is required"
            htmlFor={`${idPrefix}-event-capacity`}
            label="Capacity *"
          >
            <input
              id={`${idPrefix}-event-capacity`}
              type="number"
              {...register('capacity', { required: true, min: 1 })}
              className="input min-w-0"
              placeholder={placeholders.capacity}
            />
          </FormField>

          <FormField
            error={errors.price}
            errorMessage={errors.price?.message || 'Enter a valid event price'}
            htmlFor={`${idPrefix}-event-price`}
            label="Price (₹)"
          >
            <input
              id={`${idPrefix}-event-price`}
              type="number"
              step="0.01"
              {...register('price', {
                min: { value: 0, message: 'Price cannot be negative' }
              })}
              className="input min-w-0"
              placeholder={placeholders.price}
              defaultValue={priceDefaultValue}
            />
          </FormField>
        </div>

        <PosterPicker
          idPrefix={idPrefix}
          onPosterChange={onPosterChange}
          onPosterRemove={onPosterRemove}
          posterFile={posterFile}
          posterPreview={posterPreview}
        />
      </div>
    </div>
  );
}
