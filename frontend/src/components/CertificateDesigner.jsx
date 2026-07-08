import { useCallback, useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Upload, Save, Type, Calendar, Trash2, Eye, Award, Trophy, Medal, Users, Send, Mail, Check, AlertTriangle, X, ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import api, { API_URL, BACKEND_URL } from '../utils/api';
import toast from 'react-hot-toast';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Modal from './Modal';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const CERTIFICATE_TYPES = [
  { id: 'participation', label: 'Participation', icon: Users, color: 'blue', description: 'For all checked-in attendees' },
  { id: 'first_prize', label: '1st Prize', icon: Trophy, color: 'yellow', description: 'Gold — Winner' },
  { id: 'second_prize', label: '2nd Prize', icon: Medal, color: 'gray', description: 'Silver — Runner-up' },
  { id: 'third_prize', label: '3rd Prize', icon: Award, color: 'orange', description: 'Bronze — Second runner-up' },
];

const AVAILABLE_FIELDS = [
  { id: 'userName', label: 'Attendee Name', icon: Type },
  { id: 'eventName', label: 'Event Name', icon: Type },
  { id: 'date', label: 'Event Date', icon: Calendar },
  { id: 'certificateType', label: 'Certificate Type', icon: Award },
  { id: 'rank', label: 'Rank / Prize', icon: Trophy },
  { id: 'qrCode', label: 'Verification QR', icon: Type },
];

const CERTIFICATE_FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica', group: 'Sans serif', cssFamily: 'Helvetica, Arial, sans-serif' },
  { value: 'Helvetica Bold', label: 'Helvetica Bold', group: 'Sans serif', cssFamily: 'Helvetica, Arial, sans-serif', bold: true },
  { value: 'Helvetica Oblique', label: 'Helvetica Oblique', group: 'Sans serif', cssFamily: 'Helvetica, Arial, sans-serif', italic: true },
  { value: 'Helvetica Bold Oblique', label: 'Helvetica Bold Oblique', group: 'Sans serif', cssFamily: 'Helvetica, Arial, sans-serif', bold: true, italic: true },
  { value: 'Times-Roman', label: 'Times Roman', group: 'Serif', cssFamily: '"Times New Roman", Times, serif' },
  { value: 'Times Bold', label: 'Times Bold', group: 'Serif', cssFamily: '"Times New Roman", Times, serif', bold: true },
  { value: 'Times Italic', label: 'Times Italic', group: 'Serif', cssFamily: '"Times New Roman", Times, serif', italic: true },
  { value: 'Times Bold Italic', label: 'Times Bold Italic', group: 'Serif', cssFamily: '"Times New Roman", Times, serif', bold: true, italic: true },
  { value: 'Courier', label: 'Courier', group: 'Monospace', cssFamily: '"Courier New", Courier, monospace' },
  { value: 'Courier Bold', label: 'Courier Bold', group: 'Monospace', cssFamily: '"Courier New", Courier, monospace', bold: true },
  { value: 'Courier Oblique', label: 'Courier Oblique', group: 'Monospace', cssFamily: '"Courier New", Courier, monospace', italic: true },
  { value: 'Courier Bold Oblique', label: 'Courier Bold Oblique', group: 'Monospace', cssFamily: '"Courier New", Courier, monospace', bold: true, italic: true },
  { value: 'Symbol', label: 'Symbol', group: 'Symbol', cssFamily: 'Symbol, serif' },
  { value: 'Zapf Dingbats', label: 'Zapf Dingbats', group: 'Symbol', cssFamily: '"Zapf Dingbats", serif' },
];

const CERTIFICATE_FONT_GROUPS = [...new Set(CERTIFICATE_FONT_OPTIONS.map((font) => font.group))];

const PREVIEW_BASE_WIDTH = 820;
const MIN_PREVIEW_ZOOM = 0.3;
const MAX_PREVIEW_ZOOM = 1.6;
const PREVIEW_ZOOM_STEP = 0.1;

const clampPreviewZoom = (value) => Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))));
const clampUnit = (value) => Math.min(1, Math.max(0, Number(value)));
const getBuiltInFontOption = (value) => CERTIFICATE_FONT_OPTIONS.find((font) => font.value === value) || CERTIFICATE_FONT_OPTIONS[0];
const hashFontRef = (value) => {
  let hash = 0;
  for (const char of String(value || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
};
const createCustomFontFamily = (fontRef) => `OccasioCustomFont-${hashFontRef(fontRef)}`;
const getFontSourceUrl = (fontRef) => {
  if (!fontRef) return null;
  if (fontRef.startsWith('/uploads/')) return `${BACKEND_URL}${fontRef}`;
  if (fontRef.startsWith('http://') || fontRef.startsWith('https://')) return fontRef;
  return null;
};

export default function CertificateDesigner({ eventId, initialConfig, onSave }) {
  // Active certificate type tab
  const [activeCertType, setActiveCertType] = useState('participation');

  // Per-type state: { [certType]: { pdfData, templateUrl, mapping } }
  const [configs, setConfigs] = useState({});

  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pageWidth, setPageWidth] = useState(0);
  const [pdfError, setPdfError] = useState(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendEmails, setSendEmails] = useState('');
  const [sendingType, setSendingType] = useState('participation');
  const [previewMode, setPreviewMode] = useState('fit');
  const [previewZoom, setPreviewZoom] = useState(1);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [customFonts, setCustomFonts] = useState([]);

  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const fontInputRef = useRef(null);
  const previewScrollRef = useRef(null);
  const sendCloseButtonRef = useRef(null);
  const customFontRefs = useRef(new Set());
  const customFontBlobUrls = useRef(new Set());

  // Current active config helpers
  const activeConfig = configs[activeCertType] || { pdfData: null, templateUrl: null, mapping: [] };

  const closeSendModal = useCallback(() => {
    setSendModalOpen(false);
    setSendEmails('');
  }, []);

  const registerCustomFont = useCallback(({ fontRef, name, sourceUrl }) => {
    if (!fontRef || customFontRefs.current.has(fontRef)) {
      return customFonts.find((font) => font.fontRef === fontRef);
    }

    const fontFamily = createCustomFontFamily(fontRef);
    const fontRecord = {
      fontRef,
      name: name || 'Custom font',
      fontFamily,
      sourceUrl: sourceUrl || getFontSourceUrl(fontRef),
    };

    customFontRefs.current.add(fontRef);
    setCustomFonts(prev => [...prev, fontRecord]);

    if (fontRecord.sourceUrl && typeof FontFace !== 'undefined' && document?.fonts) {
      const fontFace = new FontFace(fontFamily, `url("${fontRecord.sourceUrl}")`);
      fontFace.load()
        .then((loadedFont) => document.fonts.add(loadedFont))
        .catch((error) => console.warn('Failed to load certificate preview font:', error));
    }

    return fontRecord;
  }, [customFonts]);

  const getMappingFontFamily = (mapping) => {
    if (mapping?.fontRef) {
      return customFonts.find((font) => font.fontRef === mapping.fontRef)?.fontFamily || getBuiltInFontOption(mapping.font).cssFamily;
    }
    return getBuiltInFontOption(mapping?.font).cssFamily;
  };

const getMappingFontStyle = (mapping) => (
  getBuiltInFontOption(mapping?.font).italic && !mapping?.fontRef ? 'italic' : 'normal'
);
const getMappingFontWeight = (mapping) => (
  mapping?.bold || (getBuiltInFontOption(mapping?.font).bold && !mapping?.fontRef) ? 800 : 500
);

  const updateActiveConfig = (updates) => {
    setConfigs(prev => ({
      ...prev,
      [activeCertType]: { ...prev[activeCertType] || { pdfData: null, templateUrl: null, mapping: [] }, ...updates }
    }));
  };

  useEffect(() => {
    if (containerRef.current) {
      setPageWidth(containerRef.current.clientWidth);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setPageWidth(containerRef.current.clientWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    customFontBlobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    customFontBlobUrls.current.clear();
  }, []);

  // Load existing certificate configs from backend
  useEffect(() => {
    loadCertificateConfigs();
  }, [eventId]);

  useEffect(() => {
    Object.values(configs).forEach((config) => {
      (config.mapping || []).forEach((field) => {
        if (field.fontRef) {
          registerCustomFont({
            fontRef: field.fontRef,
            name: field.fontLabel || field.font || 'Custom font',
          });
        }
      });
    });
  }, [configs, registerCustomFont]);

  const loadCertificateConfigs = async () => {
    try {
      const response = await api.get(`/admin/events/${eventId}/certificates/config`);
      const { configs: serverConfigs } = response.data;

      if (serverConfigs && Object.keys(serverConfigs).length > 0) {
        const loadedConfigs = {};
        for (const [type, config] of Object.entries(serverConfigs)) {
          loadedConfigs[type] = {
            templateUrl: config.templateUrl || null,
            mapping: config.mapping || [],
            pdfData: null,
            enabled: config.enabled !== false
          };
          // Load PDF preview if URL exists
          if (config.templateUrl) {
            loadPdfFromUrl(config.templateUrl, type);
          }
        }
        setConfigs(prev => ({ ...prev, ...loadedConfigs }));
      } else if (initialConfig?.templateUrl) {
        // Fallback: load legacy config as participation
        setConfigs(prev => ({
          ...prev,
          participation: {
            templateUrl: initialConfig.templateUrl,
            mapping: initialConfig.mapping || [],
            pdfData: null,
            enabled: true
          }
        }));
        if (initialConfig.templateUrl) {
          loadPdfFromUrl(initialConfig.templateUrl, 'participation');
        }
      }
    } catch (error) {
      console.error('Failed to load certificate configs:', error);
      // Fallback to initialConfig
      if (initialConfig?.templateUrl) {
        setConfigs({
          participation: {
            templateUrl: initialConfig.templateUrl,
            mapping: initialConfig.mapping || [],
            pdfData: null,
            enabled: true
          }
        });
        loadPdfFromUrl(initialConfig.templateUrl, 'participation');
      }
    }
  };

  const loadPdfFromUrl = async (url, certType) => {
    try {
      let fetchUrl = url;

      // For Cloudinary URLs, use the backend proxy to avoid 401 on raw file delivery
      if (url && (url.includes('cloudinary.com') || url.startsWith('r2://'))) {
        fetchUrl = `${API_URL}/admin/events/${eventId}/certificates/template?type=${certType}`;
      } else if (url && !url.startsWith('http') && !url.startsWith('data:')) {
        // For local URLs, use the API base
        fetchUrl = `${BACKEND_URL}${url}`;
      }

      // Use api instance for proxy endpoint (includes auth headers), plain fetch for others
      let blob;
      if (fetchUrl.includes('/certificates/template')) {
        const response = await api.get(fetchUrl.replace(/^.*\/api/, ''), { responseType: 'blob' });
        blob = new Blob([response.data], { type: 'application/pdf' });
      } else {
        const response = await fetch(fetchUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
        blob = await response.blob();
      }

      const dataUrl = await blobToDataUrl(blob);

      setConfigs(prev => ({
        ...prev,
        [certType]: { ...prev[certType] || { templateUrl: url, mapping: [] }, pdfData: dataUrl }
      }));
    } catch (error) {
      console.error(`Error loading PDF for ${certType}:`, error);
    }
  };

  const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getFieldName = (id) => {
    return AVAILABLE_FIELDS.find(f => f.id === id)?.label || id;
  };

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    // Show local preview immediately
    try {
      const dataUrl = await blobToDataUrl(selectedFile);
      updateActiveConfig({ pdfData: dataUrl, templateUrl: null, uploadError: null });
      setPdfError(null);
    } catch (error) {
      console.error('Error reading file:', error);
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post(`/admin/events/${eventId}/certificates/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      let fullUrl = res.data.url;

      if (!fullUrl) {
        console.error('Upload succeeded but no URL returned. Response:', res.data);
        toast.error('Upload succeeded but server returned no URL. Try re-uploading.');
        updateActiveConfig({ templateUrl: null, uploadError: 'Upload did not return a saved template URL. Re-upload before saving.' });
        return;
      }

      updateActiveConfig({ templateUrl: fullUrl, uploadError: null });
      toast.success('Template uploaded');
    } catch (error) {
      console.error(error);
      toast.error('Upload failed');
      updateActiveConfig({ templateUrl: null, uploadError: 'Upload failed. Re-upload before saving this template.' });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFontUpload = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    const fileName = selectedFile.name || '';
    const isSupportedFont = /\.(ttf|otf)$/i.test(fileName);
    if (!isSupportedFont) {
      toast.error('Upload a .ttf or .otf font file');
      if (fontInputRef.current) fontInputRef.current.value = '';
      return;
    }

    setUploadingFont(true);
    const previewUrl = URL.createObjectURL(selectedFile);
    customFontBlobUrls.current.add(previewUrl);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await api.post(`/admin/events/${eventId}/certificates/fonts/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const fontRef = response.data.url;
      if (!fontRef) {
        throw new Error('Font upload did not return a saved URL');
      }

      const fontName = response.data.name || fileName.replace(/\.(ttf|otf)$/i, '').replace(/[-_]+/g, ' ');
      const fontRecord = registerCustomFont({ fontRef, name: fontName, sourceUrl: previewUrl });

      if (selectedMapping) {
        updateFieldMapping(selectedMapping.fieldId, {
          font: `custom:${fontRef}`,
          fontRef,
          fontLabel: fontRecord?.name || fontName,
        });
      }

      toast.success(selectedMapping ? `Font applied to ${getFieldName(selectedMapping.fieldId)}` : 'Font uploaded');
    } catch (error) {
      console.error('Font upload error:', error);
      URL.revokeObjectURL(previewUrl);
      customFontBlobUrls.current.delete(previewUrl);
      toast.error(error.response?.data?.error || error.message || 'Font upload failed');
    } finally {
      setUploadingFont(false);
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  };

  const handleFontSelect = (fieldId, value) => {
    if (value.startsWith('custom:')) {
      const fontRef = value.slice('custom:'.length);
      const fontRecord = customFonts.find((font) => font.fontRef === fontRef);
      updateFieldMapping(fieldId, {
        font: value,
        fontRef,
        fontLabel: fontRecord?.name || 'Custom font',
      });
      return;
    }

    updateFieldMapping(fieldId, {
      font: value,
      fontRef: null,
      fontLabel: null,
    });
  };

  const placeSelectedField = (x, y) => {
    if (!selectedFieldId) {
      toast.error('Please select a field first');
      return;
    }
    if (!activeConfig.pdfData) {
      toast.error('Please upload a PDF template first');
      return;
    }

    const newMapping = (activeConfig.mapping || []).filter(m => m.fieldId !== selectedFieldId);
    newMapping.push({
      fieldId: selectedFieldId,
      x: clampUnit(x),
      y: clampUnit(y),
      fontSize: 14,
      color: '#000000',
      bold: selectedFieldId === 'userName' || selectedFieldId === 'rank',
      font: 'Helvetica',
      fontRef: null,
      fontLabel: null
    });

    updateActiveConfig({ mapping: newMapping });
    const placedFieldName = getFieldName(selectedFieldId);
    toast.success(`${placedFieldName} placed!`);
  };

  const handlePdfClick = (e) => {
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    placeSelectedField((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const handlePdfKeyDown = (event) => {
    if (event.target !== event.currentTarget || !selectedFieldId) return;

    const keyboardPlacements = {
      Enter: [0.5, 0.5],
      ' ': [0.5, 0.5],
      ArrowUp: [0.5, 0.2],
      ArrowDown: [0.5, 0.8],
      ArrowLeft: [0.2, 0.5],
      ArrowRight: [0.8, 0.5]
    };
    const placement = keyboardPlacements[event.key];
    if (!placement) return;

    event.preventDefault();
    placeSelectedField(placement[0], placement[1]);
  };

  const handleSave = async () => {
    const cfg = activeConfig;
    if (!cfg.pdfData) {
      toast.error('Please upload a template first');
      return;
    }
    if (!cfg.templateUrl) {
      toast.error('This PDF is only a local preview. Re-upload it before saving.');
      return;
    }

    try {
      // Use the new typed config endpoint
      await api.put(`/admin/events/${eventId}/certificates/config`, {
        certificateType: activeCertType,
        templateUrl: cfg.templateUrl,
        mapping: cfg.mapping,
        enabled: true
      });

      // Also save legacy fields for backward compatibility
      if (activeCertType === 'participation') {
        await api.put(`/admin/events/${eventId}`, {
          certificateEnabled: true,
          certificateTemplateUrl: cfg.templateUrl,
          certificateMapping: cfg.mapping
        });
      }

      toast.success(`${CERTIFICATE_TYPES.find(t => t.id === activeCertType)?.label} certificate config saved!`);
      if (onSave) onSave();
    } catch {
      toast.error('Failed to save configuration');
    }
  };

  const handleTestCertificate = async () => {
    const cfg = activeConfig;
    const template = cfg.templateUrl || cfg.pdfData;
    if (!template || (cfg.mapping || []).length === 0) {
      toast.error('Please upload a template and place at least one field');
      return;
    }

    try {
      toast.loading('Generating test certificate...', { id: 'test-cert' });

      const response = await api.post(
        `/admin/events/${eventId}/certificates/test`,
        { templateUrl: template, mapping: cfg.mapping, certificateType: activeCertType },
        { responseType: 'blob' }
      );

      // Check if we got a JSON error response disguised as blob
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.error || 'Server returned an error');
      }

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const preview = window.open(url, '_blank', 'noopener,noreferrer');
      if (preview) preview.opener = null;

      toast.success('Test certificate generated!', { id: 'test-cert' });
    } catch (error) {
      console.error('Test certificate error:', error);
      // Handle blob error responses from axios
      let errorMessage = 'Failed to generate test certificate';
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Could not parse error blob
        }
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      console.error('Test certificate error detail:', errorMessage);
      toast.error(errorMessage, { id: 'test-cert' });
    }
  };

  const handleSendCertificates = async () => {
    const certType = sendingType;
    const cfg = configs[certType];

    if (!cfg?.templateUrl) {
      toast.error(`No template configured for ${CERTIFICATE_TYPES.find(t => t.id === certType)?.label}. Upload and save a template first.`);
      return;
    }

    const isPrize = ['first_prize', 'second_prize', 'third_prize'].includes(certType);
    const emailList = isPrize ? sendEmails.split(/[,\n]+/).map(e => e.trim()).filter(Boolean) : [];

    if (isPrize && emailList.length === 0) {
      toast.error('Please enter at least one recipient email');
      return;
    }

    try {
      toast.loading('Sending certificates...', { id: 'send-cert' });

      const payload = {
        certificateType: certType,
        ...(isPrize ? { recipientEmails: emailList } : {})
      };

      const response = await api.post(`/admin/events/${eventId}/certificates`, payload);

      if ((response.data.generated || response.data.sent || 0) > 0) {
        toast.success(response.data.message || `Certificates generated!`, { id: 'send-cert' });
      } else {
        toast.error(response.data.message || 'No certificates were generated', { id: 'send-cert' });
      }
      setSendModalOpen(false);
      setSendEmails('');
    } catch (error) {
      console.error('Send certificates error:', error);
      toast.error(error.response?.data?.error || 'Failed to send certificates', { id: 'send-cert' });
    }
  };

  const currentMapping = activeConfig.mapping || [];
  const selectedMapping = selectedFieldId
    ? currentMapping.find(m => m.fieldId === selectedFieldId)
    : null;

  const updateFieldMapping = (fieldId, updates) => {
    updateActiveConfig({
      mapping: currentMapping.map(m => (
        m.fieldId === fieldId ? { ...m, ...updates } : m
      ))
    });
  };

  const removeField = (fieldId) => {
    updateActiveConfig({ mapping: currentMapping.filter(m => m.fieldId !== fieldId) });
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const activeType = CERTIFICATE_TYPES.find(t => t.id === activeCertType) || CERTIFICATE_TYPES[0];
  const ActiveTypeIcon = activeType.icon;
  const activeTemplateReady = Boolean(activeConfig.templateUrl || activeConfig.pdfData);
  const activeSavedTemplateReady = Boolean(activeConfig.templateUrl);
  const canPreviewActiveTemplate = activeTemplateReady && currentMapping.length > 0;
  const canSaveActiveTemplate = activeSavedTemplateReady && currentMapping.length > 0;
  const previewControlsReady = Boolean(activeConfig.pdfData) && !pdfError;
  const totalConfiguredTypes = CERTIFICATE_TYPES.filter(type => configs[type.id]?.templateUrl).length;
  const anySavedTemplateReady = totalConfiguredTypes > 0;
  const previewFitWidth = pageWidth > 0 ? Math.max(280, Math.min(pageWidth - 32, PREVIEW_BASE_WIDTH)) : 600;
  const previewFitScale = clampPreviewZoom(previewFitWidth / PREVIEW_BASE_WIDTH);
  const effectivePreviewScale = previewMode === 'fit' ? previewFitScale : previewZoom;
  const previewPageWidth = Math.round(PREVIEW_BASE_WIDTH * effectivePreviewScale);
  const previewZoomPercent = Math.round(effectivePreviewScale * 100);
  const previewAtMinZoom = effectivePreviewScale <= MIN_PREVIEW_ZOOM + 0.01;
  const previewAtMaxZoom = effectivePreviewScale >= MAX_PREVIEW_ZOOM - 0.01;

  const scrollPreviewToOrigin = () => {
    previewScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  const adjustPreviewZoom = (delta) => {
    setPreviewMode('custom');
    setPreviewZoom(prev => {
      const startingZoom = previewMode === 'fit' ? previewFitScale : prev;
      return clampPreviewZoom(startingZoom + delta);
    });
  };

  const fitPreview = () => {
    setPreviewMode('fit');
    scrollPreviewToOrigin();
  };

  const resetPreview = () => {
    setPreviewMode('custom');
    setPreviewZoom(1);
    scrollPreviewToOrigin();
  };

  return (
    <div className="admin-card overflow-visible p-0">
      <div className="rounded-t-[1.65rem] border-b border-white/10 bg-[#12100e]/90 p-4 backdrop-blur-xl sm:p-5 lg:sticky lg:top-4 lg:z-30 lg:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <p className="admin-eyebrow mb-2 sm:mb-3">Certificate designer</p>
          <h2 className="flex items-center gap-3 text-xl font-black tracking-tight text-[#f7efe3] sm:text-2xl md:text-3xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f2e7d8] text-[#17110d] sm:h-11 sm:w-11">
              <Award size={20} />
            </span>
            Certificate templates
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#aaa096]">Map fields to PDF templates, then issue certificates for this event.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {/* Send Certificates Button */}
          <button
            type="button"
            onClick={() => { setSendingType(activeCertType); setSendModalOpen(true); }}
            disabled={!anySavedTemplateReady}
            className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2.5 text-sm font-bold transition-all sm:px-4 ${
              anySavedTemplateReady
                ? 'border-[#E23744]/60 bg-[#E23744] text-white shadow-lg shadow-[#E23744]/15 hover:-translate-y-0.5 hover:bg-[#f04552]'
                : 'cursor-not-allowed border-white/5 bg-white/[0.03] text-[#716960]'
            }`}
          >
            <Send size={16} />
            <span>Distribute</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-bold text-[#f7efe3] transition-all hover:border-[#f2e7d8]/25 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          >
            <Upload size={16} />
            <span>{uploading ? 'Uploading...' : 'Upload PDF'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf,application/font-sfnt"
            className="sr-only"
            onChange={handleFontUpload}
            disabled={uploadingFont}
          />
          <button
            type="button"
            onClick={handleTestCertificate}
            disabled={!canPreviewActiveTemplate}
            className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2.5 text-sm font-bold transition-all sm:px-4 ${
              canPreviewActiveTemplate
                ? 'border-white/10 bg-white/[0.04] text-[#f7efe3] hover:border-[#f2e7d8]/25 hover:bg-white/[0.08]'
                : 'cursor-not-allowed border-white/5 bg-white/[0.03] text-[#716960]'
            }`}
          >
            <Eye size={16} />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSaveActiveTemplate}
            className={`flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold transition-all sm:px-4 ${
              canSaveActiveTemplate
                ? 'bg-[#f2e7d8] text-[#17110d] shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:bg-white'
                : 'cursor-not-allowed border border-white/5 bg-white/[0.03] text-[#716960]'
            }`}
          >
            <Save size={16} />
            <span>Save design</span>
          </button>
        </div>
      </div>
      </div>

      {/* Certificate Type Tabs */}
      <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {CERTIFICATE_TYPES.map(type => {
          const isActive = activeCertType === type.id;
          const hasConfig = Boolean(configs[type.id]?.templateUrl);
          const hasPreviewOnly = Boolean(configs[type.id]?.pdfData && !configs[type.id]?.templateUrl);
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => { setActiveCertType(type.id); setSelectedFieldId(null); setPdfError(null); }}
              aria-pressed={isActive}
              aria-label={`${type.label} certificate type${isActive ? ', selected' : ''}${hasConfig ? ', saved template ready' : hasPreviewOnly ? ', local preview only' : ', no template'}`}
              className={`flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                isActive
                  ? 'border-[#f2e7d8]/35 bg-[#f2e7d8] text-[#17110d] shadow-lg shadow-black/20'
                  : 'border-white/10 bg-white/[0.035] text-[#d9d0c6] hover:border-[#f2e7d8]/25 hover:bg-white/[0.07]'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-[#17110d]/10' : 'bg-white/[0.05]'}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{type.label}</span>
                  <span className={`mt-0.5 block text-xs ${isActive ? 'text-[#4f443a]' : 'text-[#8f867d]'}`}>
                    {hasConfig ? 'Template saved' : hasPreviewOnly ? 'Preview only' : 'No template'}
                  </span>
                </span>
              </span>
              {hasConfig && (
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isActive ? 'bg-[#17110d] text-[#f2e7d8]' : 'bg-emerald-500/15 text-emerald-300'}`}>
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Type Description */}
      <div className="mx-4 mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#100e0c]/75 p-3 sm:mx-5 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:p-4 lg:mx-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-[#f2e7d8]">
            <ActiveTypeIcon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#f7efe3]">{activeType.label}</h3>
            <p className="text-xs text-[#8f867d]">{activeType.description}</p>
          </div>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[#aaa096]">{totalConfiguredTypes} configured</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[#aaa096]">{currentMapping.length} placed</span>
        </div>
      </div>

      {activeConfig.uploadError && (
        <div className="mx-4 mb-4 rounded-2xl border border-[#E23744]/25 bg-[#E23744]/10 px-4 py-3 text-sm font-semibold text-[#ffb3b8] sm:mx-5 lg:mx-6">
          {activeConfig.uploadError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:px-5 sm:pb-5 lg:px-6 lg:pb-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Sidebar Controls */}
        <div className="space-y-4 xl:sticky xl:top-32 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto xl:pr-1">
          <div className="rounded-2xl border border-white/10 bg-[#100e0c]/75 p-3 sm:p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-[#f7efe3]">Fields</h3>
                <p className="mt-0.5 text-xs text-[#8f867d]">Select one, then click the preview.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-bold text-[#aaa096]">
                {currentMapping.length}/{AVAILABLE_FIELDS.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {AVAILABLE_FIELDS.map(field => {
                const isPlaced = currentMapping.some(m => m.fieldId === field.id);
                const isSelected = selectedFieldId === field.id;

                return (
                  <button
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    aria-pressed={isSelected}
                    aria-label={`${field.label}${isSelected ? ', selected' : ''}${isPlaced ? ', placed' : ', not placed'}`}
                    className={`group flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:p-3 ${
                      isSelected
                        ? 'border-[#E23744]/70 bg-[#E23744]/[0.12] text-[#f7efe3] shadow-[0_0_0_1px_rgba(226,55,68,0.18)]'
                        : isPlaced
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/10 bg-white/[0.035] text-[#aaa096] hover:border-[#f2e7d8]/20 hover:bg-white/[0.06] hover:text-[#f7efe3]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <field.icon size={16} className={isSelected ? 'text-[#ff6b75]' : isPlaced ? 'text-emerald-300' : 'text-[#756d66] group-hover:text-[#d9d0c6]'} />
                      <span className="truncate text-sm font-bold">{field.label}</span>
                    </span>
                    {isPlaced && <Check size={14} className="shrink-0 text-emerald-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#100e0c]/75 p-3 sm:p-4">
            <h3 className="text-sm font-black text-[#f7efe3]">Placement</h3>
            <p className="mt-1 text-xs leading-5 text-[#8f867d]">Click anywhere on the PDF preview to position the selected field. Selecting the same field again replaces its old position.</p>
          </div>

          {currentMapping.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#100e0c]/75 p-3 sm:p-4">
               <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">Placed fields</h3>
               <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                 {currentMapping.map((m, idx) => (
                   <li key={idx} className={`group flex items-center justify-between rounded-xl border p-2.5 text-sm ${selectedFieldId === m.fieldId ? 'border-[#f2e7d8]/35 bg-[#f2e7d8]/10' : 'border-white/10 bg-white/[0.035]'}`}>
                     <button
                       type="button"
                       onClick={() => setSelectedFieldId(m.fieldId)}
                       className="flex min-w-0 items-center gap-2 text-left text-[#d9d0c6]"
                     >
                       <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E23744]"></span>
                       <span className="truncate font-bold">{getFieldName(m.fieldId)}</span>
                     </button>
                     <button onClick={() => removeField(m.fieldId)} className="rounded-lg p-1.5 text-[#756d66] transition-colors hover:bg-[#E23744]/10 hover:text-[#ff6b75] focus-visible:bg-[#E23744]/10 focus-visible:text-[#ff6b75] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" aria-label={`Remove ${getFieldName(m.fieldId)}`}>
                       <Trash2 size={14} />
                     </button>
                   </li>
                 ))}
               </ul>
            </div>
          )}

          {selectedMapping ? (
            <div className="rounded-2xl border border-white/10 bg-[#100e0c]/75 p-3 sm:p-4">
              <div className="mb-4">
                <h3 className="text-sm font-black text-[#f7efe3]">Field inspector</h3>
                <p className="mt-0.5 text-xs text-[#8f867d]">{getFieldName(selectedMapping.fieldId)}</p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-[#8f867d]">
                    Font size
                    <span className="font-mono tracking-normal text-[#d9d0c6]">{selectedMapping.fontSize || 14}px</span>
                  </span>
                  <input
                    type="range"
                    min="8"
                    max="48"
                    value={selectedMapping.fontSize || 14}
                    onChange={(event) => updateFieldMapping(selectedMapping.fieldId, { fontSize: Number(event.target.value) })}
                    className="w-full accent-[#E23744]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#8f867d]">X position</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round((selectedMapping.x || 0) * 100)}
                      onChange={(event) => updateFieldMapping(selectedMapping.fieldId, { x: clampUnit(Number(event.target.value) / 100) })}
                      className="input py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#8f867d]">Y position</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round((selectedMapping.y || 0) * 100)}
                      onChange={(event) => updateFieldMapping(selectedMapping.fieldId, { y: clampUnit(Number(event.target.value) / 100) })}
                      className="input py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className="block">
                    <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-[#8f867d]">
                      Font
                      <span className="tracking-normal text-[#d9d0c6]">{CERTIFICATE_FONT_OPTIONS.length + customFonts.length}</span>
                    </span>
                    <select
                      value={selectedMapping.fontRef ? `custom:${selectedMapping.fontRef}` : selectedMapping.font || 'Helvetica'}
                      onChange={(event) => handleFontSelect(selectedMapping.fieldId, event.target.value)}
                      className="input py-2 text-sm"
                    >
                      {CERTIFICATE_FONT_GROUPS.map((group) => (
                        <optgroup key={group} label={group}>
                          {CERTIFICATE_FONT_OPTIONS.filter((font) => font.group === group).map((font) => (
                            <option key={font.value} value={font.value}>{font.label}</option>
                          ))}
                        </optgroup>
                      ))}
                      {customFonts.length > 0 && (
                        <optgroup label="Uploaded">
                          {customFonts.map((font) => (
                            <option key={font.fontRef} value={`custom:${font.fontRef}`}>{font.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#8f867d]">Color</span>
                    <input
                      type="color"
                      value={selectedMapping.color || '#000000'}
                      onChange={(event) => updateFieldMapping(selectedMapping.fieldId, { color: event.target.value })}
                      className="h-10 w-12 rounded-xl border border-white/10 bg-transparent p-1"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => fontInputRef.current?.click()}
                  disabled={uploadingFont}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-bold text-[#f7efe3] transition-colors hover:border-[#f2e7d8]/25 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload size={15} />
                  {uploadingFont ? 'Uploading font...' : 'Upload font'}
                </button>

                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm font-bold text-[#d9d0c6]">
                  Bold text
                  <input
                    type="checkbox"
                    checked={Boolean(selectedMapping.bold)}
                    onChange={(event) => updateFieldMapping(selectedMapping.fieldId, { bold: event.target.checked })}
                    className="h-4 w-4 accent-[#E23744]"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm leading-6 text-[#8f867d]">
              {selectedFieldId ? (
                <>
                  <span className="block font-bold text-[#d9d0c6]">{getFieldName(selectedFieldId)} selected</span>
                  Click the preview or place it at the center, then tune its exact position.
                  <button
                    type="button"
                    onClick={() => placeSelectedField(0.5, 0.5)}
                    disabled={!activeConfig.pdfData}
                    className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Place at center
                  </button>
                </>
              ) : (
                'Select a field or placed marker to keep its controls here.'
              )}
            </div>
          )}
        </div>

        {/* PDF Preview Area */}
        <div className="min-h-[420px] rounded-2xl border border-white/10 bg-[#090807] p-2 shadow-inner shadow-black/40 sm:min-h-[520px] sm:p-3" ref={containerRef}>
          <div className="mb-3 flex flex-col gap-3 border-b border-white/10 px-2 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-black text-[#f7efe3]">Template preview</h3>
              <p className="text-xs text-[#8f867d]">
                {selectedFieldId ? `Place ${getFieldName(selectedFieldId)}` : activeTemplateReady ? 'Select a field to edit placements.' : 'Upload a PDF to begin.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${
                activeTemplateReady
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/[0.035] text-[#8f867d]'
              }`}>
                {activeTemplateReady ? 'Template loaded' : 'Waiting for PDF'}
              </span>

              <div className="flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1">
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(-PREVIEW_ZOOM_STEP)}
                  disabled={!previewControlsReady || previewAtMinZoom}
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                    previewControlsReady && !previewAtMinZoom
                      ? 'text-[#d9d0c6] hover:bg-white/[0.08] hover:text-[#f7efe3]'
                      : 'cursor-not-allowed text-[#5f574f]'
                  }`}
                  aria-label="Zoom out preview"
                  title="Zoom out"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="min-w-[3.35rem] text-center font-mono text-xs font-bold text-[#aaa096]">
                  {previewZoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(PREVIEW_ZOOM_STEP)}
                  disabled={!previewControlsReady || previewAtMaxZoom}
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                    previewControlsReady && !previewAtMaxZoom
                      ? 'text-[#d9d0c6] hover:bg-white/[0.08] hover:text-[#f7efe3]'
                      : 'cursor-not-allowed text-[#5f574f]'
                  }`}
                  aria-label="Zoom in preview"
                  title="Zoom in"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  type="button"
                  onClick={fitPreview}
                  disabled={!previewControlsReady || previewMode === 'fit'}
                  className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold transition-colors ${
                    previewControlsReady && previewMode !== 'fit'
                      ? 'text-[#d9d0c6] hover:bg-white/[0.08] hover:text-[#f7efe3]'
                      : 'cursor-not-allowed text-[#5f574f]'
                  }`}
                  aria-label="Fit preview to panel"
                  title="Fit to panel"
                >
                  <Maximize2 size={14} />
                  <span>Fit</span>
                </button>
                <button
                  type="button"
                  onClick={resetPreview}
                  disabled={!previewControlsReady}
                  className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold transition-colors ${
                    previewControlsReady
                      ? 'text-[#d9d0c6] hover:bg-white/[0.08] hover:text-[#f7efe3]'
                      : 'cursor-not-allowed text-[#5f574f]'
                  }`}
                  aria-label="Reset preview zoom"
                  title="Reset to 100%"
                >
                  <RotateCcw size={14} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          <div
            ref={previewScrollRef}
            className={`flex min-h-[360px] max-h-[72vh] overflow-auto rounded-xl border border-white/5 bg-[#0c0b0a] p-3 sm:min-h-[450px] sm:p-4 ${
              activeConfig.pdfData && !uploading && !pdfError ? 'items-start justify-center' : 'items-center justify-center'
            }`}
          >
          {!activeConfig.pdfData && !uploading ? (
            <div className="w-full max-w-sm rounded-2xl border border-dashed border-[#f2e7d8]/20 bg-white/[0.035] p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2e7d8] text-[#17110d]">
                <Upload size={22} />
              </div>
              <h3 className="text-lg font-black text-[#f7efe3]">Upload a PDF template</h3>
              <p className="mt-2 text-sm leading-6 text-[#aaa096]">Current certificate type: <span className="font-bold text-[#f7efe3]">{activeType.label}</span></p>
              <button onClick={() => fileInputRef.current?.click()} className="mt-5 w-full rounded-full bg-[#f2e7d8] px-4 py-2.5 text-sm font-black text-[#17110d] transition-colors hover:bg-white">
                Browse files
              </button>
            </div>
          ) : uploading && !activeConfig.pdfData ? (
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <div className="mb-4 h-3 w-32 animate-pulse rounded-full bg-white/15"></div>
              <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-xl bg-white/10"></div>
                <div className="h-20 animate-pulse rounded-xl bg-white/[0.07]"></div>
                <div className="h-20 animate-pulse rounded-xl bg-white/[0.05]"></div>
              </div>
              <p className="mt-4 text-sm font-bold text-[#d9d0c6]">Processing template...</p>
            </div>
          ) : pdfError ? (
            <div className="w-full max-w-md rounded-2xl border border-[#E23744]/25 bg-[#E23744]/10 p-6">
              <div className="mb-4 flex items-center gap-3 text-[#ff9ca3]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E23744]/20">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#ffd5d8]">Template preview failed</h3>
                  <p className="text-sm text-[#ffb3b8]">{pdfError}</p>
                </div>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full border border-[#ff9ca3]/30 bg-[#ff9ca3]/10 px-4 py-2 text-sm font-bold text-[#ffd5d8] transition-colors hover:bg-[#ff9ca3]/20"
              >
                Replace PDF
              </button>
            </div>
          ) : (
            <div
              className="relative z-10 inline-block cursor-crosshair overflow-hidden rounded-md bg-white shadow-2xl shadow-black/50"
              onClick={handlePdfClick}
              onKeyDown={handlePdfKeyDown}
              role="button"
              tabIndex={0}
              aria-label={selectedFieldId ? `Place ${getFieldName(selectedFieldId)} on certificate preview` : 'Certificate preview placement surface'}
              style={{ display: 'inline-block' }}
            >
               <Document
                file={activeConfig.pdfData}
                onLoadSuccess={() => {
                  setPdfError(null);
                }}
                onLoadError={(error) => {
                  console.error('PDF load error:', error);
                  setPdfError('Failed to render PDF. The file may be corrupted.');
                }}
                loading={
                  <div className="flex flex-col items-center justify-center p-12 text-[#aaa096]">
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#E23744]/25 border-t-[#E23744]"></div>
                    <span className="text-sm">Rendering PDF...</span>
                  </div>
                }
                error={<div className="rounded-lg bg-[#E23744]/10 p-8 text-[#ff9ca3]">Failed to load PDF preview.</div>}
              >
                <Page
                  pageNumber={1}
                  width={previewPageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="bg-white"
                />
              </Document>

              {/* Markers Overlay */}
              {currentMapping.map((m) => {
                const selected = selectedFieldId === m.fieldId;
                const isQr = m.fieldId === 'qrCode';

                return (
                  <button
                    type="button"
                    key={m.fieldId}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedFieldId(m.fieldId);
                    }}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-1 text-left shadow-lg transition-colors ${selected ? 'border-[#E23744] bg-white' : 'border-black/15 bg-white/80 hover:bg-white'}`}
                    style={{
                      left: `${m.x * 100}%`,
                      top: `${m.y * 100}%`,
                      color: isQr ? '#111111' : (m.color || '#111111'),
                      fontSize: isQr ? '12px' : `${m.fontSize || 14}px`,
                      fontFamily: getMappingFontFamily(m),
                      fontStyle: getMappingFontStyle(m),
                      fontWeight: getMappingFontWeight(m),
                    }}
                    aria-label={`Edit ${getFieldName(m.fieldId)} placement`}
                  >
                    {isQr ? (
                      <span className="grid h-16 w-16 place-items-center border border-black/25 bg-white text-[10px] font-black uppercase tracking-[0.12em] text-black">
                        QR
                      </span>
                    ) : (
                      <span>{getFieldName(m.fieldId)}</span>
                    )}
                  </button>
                );
              })}

              {/* Ghost Marker for current selection */}
              {selectedFieldId && (
                <div className="pointer-events-none absolute inset-0 z-0 border-2 border-dashed border-[#E23744]/45 bg-[#E23744]/5">
                  <div className="absolute left-4 top-4 rounded-full bg-[#17110d]/[0.88] px-3 py-1.5 text-xs font-bold text-[#f7efe3] shadow-lg">
                    Place {getFieldName(selectedFieldId)}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      placeSelectedField(0.5, 0.5);
                    }}
                    className="pointer-events-auto absolute bottom-4 left-4 rounded-full bg-[#17110d]/[0.9] px-3 py-1.5 text-xs font-bold text-[#f7efe3] shadow-lg transition-colors hover:bg-[#E23744] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744]"
                  >
                    Place at center
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Send Certificates Modal */}
      {sendModalOpen && (
        <Modal
          ariaLabelledby="send-certificates-title"
          ariaDescribedby="send-certificates-description"
          initialFocusRef={sendCloseButtonRef}
          closeOnBackdrop
          onClose={closeSendModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          panelClassName="w-full max-w-lg rounded-[1.65rem] border border-white/10 bg-[#12100e] p-6 shadow-2xl shadow-black/50"
        >
            <div className="flex items-center justify-between mb-6">
              <h3 id="send-certificates-title" className="text-xl font-black text-[#f7efe3] flex items-center gap-3">
                <div className="rounded-xl bg-[#f2e7d8] p-2 text-[#17110d]">
                  <Mail size={20} />
                </div>
                Distribute Certificates
              </h3>
              <button
                type="button"
                ref={sendCloseButtonRef}
                onClick={closeSendModal}
                className="rounded-xl p-2 text-[#8f867d] transition-colors hover:bg-white/[0.06] hover:text-[#f7efe3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744]"
                aria-label="Close certificate distribution dialog"
              >
                <X size={20} />
              </button>
            </div>

            {/* Type Selector */}
            <div className="mb-6">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d] mb-3 block">Select type to send</label>
              <div className="grid grid-cols-2 gap-3">
                {CERTIFICATE_TYPES.map(type => {
                  const Icon = type.icon;
                  const hasConfig = Boolean(configs[type.id]?.templateUrl);
                  return (
                    <button
                      type="button"
                      key={type.id}
                      onClick={() => setSendingType(type.id)}
                      disabled={!hasConfig}
                      className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-bold transition-all ${
                        sendingType === type.id
                          ? 'border-[#f2e7d8]/35 bg-[#f2e7d8] text-[#17110d] shadow-lg shadow-black/20'
                          : hasConfig
                          ? 'border-white/10 bg-white/[0.04] text-[#d9d0c6] hover:border-[#f2e7d8]/25 hover:bg-white/[0.07]'
                          : 'cursor-not-allowed border-white/5 bg-black/20 text-[#5f574f]'
                      }`}
                    >
                      <Icon size={24} />
                      <span>{type.label}</span>
                      {!hasConfig && <span className="mt-1 rounded-full bg-[#E23744]/10 px-2 py-0.5 text-[10px] text-[#ff8f97]">No template</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Info message */}
            <div id="send-certificates-description" className="mb-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-[#d9d0c6]">
              <div className="mt-0.5 text-[#f2e7d8]"><Users size={16} /></div>
              <div>
                {sendingType === 'participation' ? (
                  <p>This will generate participation certificates for <strong className="text-[#f7efe3]">checked-in attendees</strong>.</p>
                ) : (
                  <p>Enter recipient emails for the <strong className="text-[#f7efe3]">{CERTIFICATE_TYPES.find(t => t.id === sendingType)?.label}</strong> certificate.</p>
                )}
              </div>
            </div>

            {/* Email input for prize certificates */}
            {['first_prize', 'second_prize', 'third_prize'].includes(sendingType) && (
              <div className="mb-6">
                <label htmlFor="certificate-recipient-emails" className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d] mb-3 block">Recipient emails</label>
                <textarea
                  id="certificate-recipient-emails"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-[#f7efe3] placeholder-[#716960] transition-all focus:border-[#E23744]/70 focus:outline-none focus:ring-2 focus:ring-[#E23744]/20"
                  rows={4}
                  placeholder={"winner@example.com\nrunnerup@example.com"}
                  value={sendEmails}
                  onChange={(e) => setSendEmails(e.target.value)}
                />
                <p className="mt-2 pl-1 text-xs text-[#8f867d]">Separate multiple emails with commas or new lines.</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={closeSendModal}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCertificates}
                className="flex items-center gap-2 rounded-full bg-[#E23744] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#E23744]/15 transition-all hover:bg-[#f04552]"
              >
                <Send size={16} />
                Send Certificates
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
