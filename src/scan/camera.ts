import { isIos, isStandalone } from '../platform.ts';

export type CameraProblem =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'notFound'
  | 'busy'
  | 'unknown';

export interface CameraError {
  problem: CameraProblem;
  title: string;
  message: string;
  /** Erneut versuchen ist sinnvoll (z. B. Kamera war belegt). */
  retry: boolean;
}

const IOS_SETTINGS_PATH =
  'Öffne die iPhone-Einstellungen, wähle Safari (ab iOS 18 unter „Apps“), dann Kamera, und stelle „Fragen“ oder „Erlauben“ ein.';

function deniedMessage(): string {
  if (isIos()) {
    return isStandalone()
      ? `VoxDoc darf die Kamera nicht verwenden. ${IOS_SETTINGS_PATH} Starte VoxDoc danach neu.`
      : `VoxDoc darf die Kamera nicht verwenden. Öffne in Safari das Seitenmenü in der Adressleiste, wähle „Website-Einstellungen“ und bei Kamera „Erlauben“. Oder: ${IOS_SETTINGS_PATH}`;
  }
  return 'VoxDoc darf die Kamera nicht verwenden. Erlaube den Kamerazugriff in den Website-Einstellungen deines Browsers.';
}

export function describeCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { problem: 'denied', title: 'Kein Zugriff auf die Kamera', message: deniedMessage(), retry: true };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        problem: 'notFound',
        title: 'Keine Kamera gefunden',
        message: 'Auf diesem Gerät wurde keine passende Kamera gefunden.',
        retry: false,
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        problem: 'busy',
        title: 'Kamera ist belegt',
        message:
          'Die Kamera wird gerade von einer anderen App verwendet, zum Beispiel einem Anruf. Beende die andere App und versuche es erneut.',
        retry: true,
      };
    case 'SecurityError':
      return insecure();
    default:
      return {
        problem: 'unknown',
        title: 'Kamera konnte nicht gestartet werden',
        message: 'Beim Starten der Kamera ist ein Fehler aufgetreten. Versuche es erneut.',
        retry: true,
      };
  }
}

function insecure(): CameraError {
  return {
    problem: 'insecure',
    title: 'Kamera nur über eine sichere Verbindung',
    message: 'Die Live-Kamera funktioniert nur, wenn VoxDoc über HTTPS geöffnet wird.',
    retry: false,
  };
}

/** Prüft vorab, ob eine Live-Kamera überhaupt möglich ist. */
export function cameraAvailability(): CameraError | null {
  if (!window.isSecureContext) {
    return insecure();
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      problem: 'unsupported',
      title: 'Live-Kamera nicht verfügbar',
      message: 'Dieser Browser unterstützt keine Live-Kamera.',
      retry: false,
    };
  }
  return null;
}

/** `denied` ohne Nachfrage erkennen, wenn der Browser es verrät (Safari 16+). */
export async function permissionDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    return status?.state === 'denied';
  } catch {
    return false;
  }
}

export class Camera {
  private stream: MediaStream | null = null;

  constructor(private readonly video: HTMLVideoElement) {
    // Ohne diese Attribute öffnet iOS das Video im Vollbild-Player.
    video.playsInline = true;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
  }

  get active(): boolean {
    return this.stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  }

  async start(): Promise<void> {
    this.stop();
    const video: MediaTrackConstraints = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1920 },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      if ((error as Error).name !== 'OverconstrainedError') {
        throw error;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise((resolve) => this.video.addEventListener('loadedmetadata', resolve, { once: true }));
    }
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.video.srcObject = null;
  }

  /** Taschenlampe, falls Gerät und Browser sie anbieten. */
  get torchSupported(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return capabilities?.torch === true;
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.torchSupported) {
      return false;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }
}
