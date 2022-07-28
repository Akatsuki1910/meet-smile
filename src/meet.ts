import '@tensorflow/tfjs'
import * as facemesh from '@tensorflow-models/facemesh'
import faceImg from './baseImg'

declare global {
  interface MediaStreamTrack {
    _stop(): void
  }

  interface MediaDevices {
    _getUserMedia:
      | ((constraints?: MediaStreamConstraints) => Promise<MediaStream>)
      | undefined
  }
}

const video = document.createElement('video')
const canvas = document.createElement('canvas')
let canvasCtx: CanvasRenderingContext2D | null
let keepAnimation = false
let mask_btn = '0'
let faceImgData: HTMLImageElement

function createDom() {
  canvas.width = 640
  canvas.height = 480
  canvasCtx = canvas.getContext('2d')
}

function createGUI(node: HTMLBodyElement) {
  try {
    const d = document.createElement('select')
    d.style.cssText = 'position: absolute; top: 0; z-index: 2001;'
    d.id = 'toggle'
    const faceImgName = ['none', 'aktk', 'smile']
    faceImgName.forEach((f, i) => {
      const inp = document.createElement('option')
      inp.text = f
      inp.value = String(i)
      d.appendChild(inp)
    })

    node.appendChild(d)

    node?.querySelector('#toggle')?.addEventListener(
      'change',
      (evt) => {
        if (evt) {
          const tar = evt.target as HTMLSelectElement
          const ind = ~~tar.selectedIndex
          const flg = !!ind
          tar.classList.toggle('on', flg)
          mask_btn = String(ind)
          if (flg) {
            faceImgData = faceImg[ind - 1]
          }
        }
      },
      false,
    )
  } catch (e) {
    console.error('ERROR:', e)
  }
}

function replaceGetUserMedia() {
  if (navigator.mediaDevices._getUserMedia) {
    console.warn('ALREADY replace getUserMedia()')
    return
  }

  navigator.mediaDevices._getUserMedia = navigator.mediaDevices.getUserMedia
  navigator.mediaDevices.getUserMedia = _modifiedGetUserMedia
}

function _modifiedGetUserMedia(
  constraints: MediaStreamConstraints | undefined,
): Promise<MediaStream> {
  const withVideo = !!constraints?.video
  if (constraints?.video) {
    _setupCanvasSize(constraints)
  }

  const withAudio = !!constraints?.audio
  if (mask_btn !== '0') {
    return _startStream(withVideo, withAudio, constraints)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return navigator.mediaDevices._getUserMedia!(constraints)
  }
}

function _setupCanvasSize(constraints: MediaStreamConstraints) {
  const vid = constraints.video as MediaTrackConstraints
  const adv = vid.advanced
  if (adv) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adv.forEach((item: any) => {
      if (item.width?.min) {
        canvas.width = item.width.min
      }
      if (item.height?.min) {
        canvas.height = item.height.min
      }
    })
    video.width = canvas.width
    video.height = canvas.height

    return
  }

  if (vid.width) {
    canvas.width = vid.width as number
  }

  if (vid.height) {
    canvas.height = vid.height as number
  }

  video.width = canvas.width
  video.height = canvas.height
}

function _startStream(
  withVideo: boolean,
  withAudio: boolean,
  constraints: MediaStreamConstraints | undefined,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    if (!withVideo) {
      // NEED video
      reject('NEED video for mask')
    }

    // まずはデバイスの映像を取得する（指定されていれば音声も）
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    navigator.mediaDevices._getUserMedia!(constraints)
      .then(async (stream: MediaStream) => {
        video.srcObject = stream
        video.onloadedmetadata = () => {
          video.width = video.videoWidth
          video.height = video.videoHeight
          canvas.width = video.width
          canvas.height = video.height
        }
        await video.play().catch((err) => console.error('ERROR:', err))
        video.volume = 0.0

        // Canvasを更新する処理をrequestAnimationFrame()で呼び出す
        _clearCanvas()
        requestAnimationFrame(_updateCanvas)
        // Canvasから映像ストリームを取り出す
        const canvasStream = canvas.captureStream(10)
        if (!canvasStream) {
          reject('canvas Capture ERROR')
        }
        keepAnimation = true

        // 利用側で映像の停止が呼び出されたら、元のデバイスの映像も停止させるように処理を追加
        const videoTrack = canvasStream.getVideoTracks()[0]
        if (videoTrack) {
          videoTrack._stop = videoTrack.stop
          videoTrack.stop = function () {
            keepAnimation = false
            videoTrack._stop()
            stream
              .getTracks()
              .forEach((track: MediaStreamTrack) => track.stop())
          }
        }

        if (withAudio) {
          const audioTrack = stream.getAudioTracks()[0]
          if (audioTrack) {
            canvasStream.addTrack(audioTrack)
          } else {
            console.warn('WARN: NO audio in device stream')
          }
        }

        resolve(canvasStream)
      })
      .catch((err: unknown) => {
        reject(err)
      })
  })
}

function _updateCanvas() {
  try {
    _drawCanvas()
  } catch (err) {
    console.error('draw ERR:' + err)
  }

  if (keepAnimation) {
    window.requestAnimationFrame(_updateCanvas)
  }
}

function _drawCanvas() {
  //facemeshで顔検出
  _face_model
    ?.estimateFaces(video)
    .then((predictions: facemesh.AnnotatedPrediction[]) => {
      const ctx = canvasCtx
      ctx?.drawImage(video, 0, 0)

      //顔が検出されていればマスク用画像合成
      if (predictions.length !== 0) {
        const expansion = faceImgData.width / 1000 + 1
        const tl = predictions[0].boundingBox.topLeft as number[]
        const br = predictions[0].boundingBox.bottomRight as number[]
        const i_width = (br[0] - tl[0]) * expansion
        const i_height = (faceImgData.height * i_width) / faceImgData.width
        const x = tl[0] + (br[0] - tl[0] - i_width) / 2
        const y = tl[1] + (br[1] - tl[1] - i_height) / 2 - 50
        ctx?.drawImage(faceImgData, x, y, i_width, i_height)
      }
    })
    .catch((err: unknown) => {
      console.error('ERROR:', err)
    })
}

function _clearCanvas() {
  if (canvasCtx) {
    canvasCtx.fillStyle = 'rgb(255,255,255)'
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

let _face_model: facemesh.FaceMesh | null = null
async function _face_loadModel() {
  const model = await facemesh.load()
  _face_model = model
}

function main() {
  if (navigator.mediaDevices._getUserMedia !== undefined) return

  const insertPoint = document.getElementsByTagName('body')[0]

  createDom()
  createGUI(insertPoint)

  replaceGetUserMedia()

  setTimeout(_face_loadModel, 1000)
}
main()
