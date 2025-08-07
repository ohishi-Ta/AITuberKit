import * as THREE from 'three'
import { Model } from './model'
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation'
import { buildUrl } from '@/utils/buildUrl'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import settingsStore from '@/features/stores/settings'

/**
 * three.jsを使った3Dビューワー
 *
 * setup()でcanvasを渡してから使う
 */
export class Viewer {
  public isReady: boolean
  public model?: Model

  private _renderer?: THREE.WebGLRenderer
  private _clock: THREE.Clock
  private _scene: THREE.Scene
  private _camera?: THREE.PerspectiveCamera
  private _cameraControls?: OrbitControls
  private _directionalLight?: THREE.DirectionalLight
  private _ambientLight?: THREE.AmbientLight
  private _walkAnimationAction?: THREE.AnimationAction
  private _defaultAnimationAction?: THREE.AnimationAction

  constructor() {
    this.isReady = false

    // scene
    const scene = new THREE.Scene()
    this._scene = scene

    // light
    const lightingIntensity = settingsStore.getState().lightingIntensity
    this._directionalLight = new THREE.DirectionalLight(
      0xffffff,
      1.8 * lightingIntensity
    )
    this._directionalLight.position.set(1.0, 1.0, 1.0).normalize()
    scene.add(this._directionalLight)

    this._ambientLight = new THREE.AmbientLight(
      0xffffff,
      1.2 * lightingIntensity
    )
    scene.add(this._ambientLight)

    // animate
    this._clock = new THREE.Clock()
    this._clock.start()
  }

  public loadVrm(url: string) {
    if (this.model?.vrm) {
      this.unloadVRM()
    }

    // gltf and vrm
    this.model = new Model(this._camera || new THREE.Object3D())
    this.model.loadVRM(url).then(async () => {
      if (!this.model?.vrm) return

      // Disable frustum culling
      this.model.vrm.scene.traverse((obj) => {
        obj.frustumCulled = false
      })

      this._scene.add(this.model.vrm.scene)

      // ========== ここから追加/変更 ==========
      // VRMモデル全体を右に移動（X軸の正の方向）
      // 値を調整して好みの位置にしてください（例: 0.3 = 30cm右へ）
      const horizontalOffset = -0.2; // この値を変更して位置を調整
      
      // モデル全体の位置を設定
      this.model.vrm.scene.position.x = horizontalOffset;
      // ========== ここまで追加/変更 ==========

      // Load walk animation for initial display
      const walkVrma = await loadVRMAnimation(buildUrl('/vrma/vbox-appearing-7KKFBBJ2.vrma'))
      if (walkVrma && this.model.mixer) {
        const walkClip = walkVrma.createAnimationClip(this.model.vrm)
        this._walkAnimationAction = this.model.mixer.clipAction(walkClip)
        this._walkAnimationAction.setLoop(THREE.LoopOnce, 1)
        this._walkAnimationAction.clampWhenFinished = true
        this._walkAnimationAction.play()
      }

      // Load default animation
      const defaultVrma = await loadVRMAnimation(buildUrl('/vrma/vbox-waiting-I3CZ3FBD.vrma'))
      if (defaultVrma && this.model.mixer) {
        const defaultClip = defaultVrma.createAnimationClip(this.model.vrm)
        this._defaultAnimationAction = this.model.mixer.clipAction(defaultClip)
        this._defaultAnimationAction.setLoop(THREE.LoopRepeat, Infinity)
        
        // Wait for walk animation to finish, then switch to default
        if (this._walkAnimationAction) {
          this.model.mixer.addEventListener('finished', (e) => {
            if (e.action === this._walkAnimationAction) {
              this.switchToDefaultAnimation()
            }
          })
        } else {
          // If walk animation failed to load, start default immediately
          this._defaultAnimationAction.play()
        }
      }

      // HACK: アニメーションの原点がずれているので再生後にカメラ位置を調整する
      requestAnimationFrame(() => {
        this.resetCamera()
      })
    })
  }

  /**
   * Switch from walk animation to default animation
   */
  private switchToDefaultAnimation() {
    if (this._walkAnimationAction && this._defaultAnimationAction && this.model?.mixer) {
      // Fade out walk animation and fade in default animation
      this._walkAnimationAction.fadeOut(0.5)
      this._defaultAnimationAction.reset()
      this._defaultAnimationAction.fadeIn(0.5)
      this._defaultAnimationAction.play()
      
      // Clean up walk animation after fade out
      setTimeout(() => {
        if (this._walkAnimationAction) {
          this._walkAnimationAction.stop()
        }
      }, 500)
    }
  }

  /**
   * Manually switch to default animation (can be called externally if needed)
   */
  public playDefaultAnimation() {
    if (this._walkAnimationAction && this._walkAnimationAction.isRunning()) {
      this._walkAnimationAction.stop()
    }
    this.switchToDefaultAnimation()
  }

  public unloadVRM(): void {
    if (this.model?.vrm) {
      // Stop all animations
      if (this._walkAnimationAction) {
        this._walkAnimationAction.stop()
        this._walkAnimationAction = undefined
      }
      if (this._defaultAnimationAction) {
        this._defaultAnimationAction.stop()
        this._defaultAnimationAction = undefined
      }
      
      this._scene.remove(this.model.vrm.scene)
      this.model?.unLoadVrm()
    }
  }

  /**
   * Reactで管理しているCanvasを後から設定する
   */
  public setup(canvas: HTMLCanvasElement) {
    const parentElement = canvas.parentElement
    const width = parentElement?.clientWidth || canvas.width
    const height = parentElement?.clientHeight || canvas.height
    // renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
    })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)

    // camera
    this._camera = new THREE.PerspectiveCamera(20.0, width / height, 0.1, 20.0)
    this._camera.position.set(0, 1.3, 2.0)
    this._cameraControls?.target.set(0, 1.3, 0)
    this._cameraControls?.update()
    // camera controls
    this._cameraControls = new OrbitControls(
      this._camera,
      this._renderer.domElement
    )
    this._cameraControls.screenSpacePanning = true
    this._cameraControls.update()

    // Listen for position lock changes
    this._cameraControls.addEventListener('end', () => {
      if (!settingsStore.getState().fixedCharacterPosition) {
        this.saveCameraPosition()
      }
    })

    window.addEventListener('resize', () => {
      this.resize()
    })
    this.isReady = true
    this.update()

    // Restore saved position if available
    this.restoreCameraPosition()
  }

  /**
   * canvasの親要素を参照してサイズを変更する
   */
  public resize() {
    if (!this._renderer) return

    const parentElement = this._renderer.domElement.parentElement
    if (!parentElement) return

    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(
      parentElement.clientWidth,
      parentElement.clientHeight
    )

    if (!this._camera) return
    this._camera.aspect = parentElement.clientWidth / parentElement.clientHeight
    this._camera.updateProjectionMatrix()
  }

  /**
   * VRMのheadノードを参照してカメラ位置を調整する
   */
  public resetCamera() {
    const { fixedCharacterPosition } = settingsStore.getState()
    // If position is fixed, restore saved position instead of auto-adjusting
    if (fixedCharacterPosition) {
      this.restoreCameraPosition()
      return
    }

    const headNode = this.model?.vrm?.humanoid.getNormalizedBoneNode('head')

    if (headNode) {
      const headWPos = headNode.getWorldPosition(new THREE.Vector3())
      
      // ========== ここから追加/変更 ==========
      // モデルの位置オフセットを考慮してカメラターゲットを調整
      const modelOffset = this.model?.vrm?.scene.position.x || 0;
      
      this._camera?.position.set(
        this._camera.position.x,
        headWPos.y,
        this._camera.position.z
      )
      this._cameraControls?.target.set(
        headWPos.x + modelOffset, // X位置にオフセットを追加
        headWPos.y, 
        headWPos.z
      )
      // ========== ここまで追加/変更 ==========
      
      this._cameraControls?.update()
    }
  }

  public update = () => {
    requestAnimationFrame(this.update)
    const delta = this._clock.getDelta()
    // update vrm components
    if (this.model) {
      this.model.update(delta)
    }

    if (this._renderer && this._camera) {
      this._renderer.render(this._scene, this._camera)
    }
  }

  /**
   * 現在のカメラ位置を設定に保存する
   */
  public saveCameraPosition() {
    if (!this._camera || !this._cameraControls) return

    const settings = settingsStore.getState()
    settingsStore.setState({
      characterPosition: {
        x: this._camera.position.x,
        y: this._camera.position.y,
        z: this._camera.position.z,
        scale: settings.characterPosition?.scale ?? 1,
      },
      characterRotation: {
        x: this._cameraControls.target.x,
        y: this._cameraControls.target.y,
        z: this._cameraControls.target.z,
      },
    })
  }

  /**
   * 保存されたカメラ位置を復元する
   */
  public restoreCameraPosition() {
    if (!this._camera || !this._cameraControls) return

    const { characterPosition, characterRotation, fixedCharacterPosition } =
      settingsStore.getState()

    if (
      fixedCharacterPosition &&
      (characterPosition.x !== 0 ||
        characterPosition.y !== 0 ||
        characterPosition.z !== 0)
    ) {
      this._camera.position.set(
        characterPosition.x,
        characterPosition.y,
        characterPosition.z
      )
      this._cameraControls.target.set(
        characterRotation.x,
        characterRotation.y,
        characterRotation.z
      )
      this._cameraControls.update()
    }
  }

  /**
   * カメラ位置を固定する
   */
  public fixCameraPosition() {
    this.saveCameraPosition()
    settingsStore.setState({ fixedCharacterPosition: true })
    if (this._cameraControls) {
      this._cameraControls.enabled = false
    }
  }

  /**
   * カメラ位置の固定を解除する
   */
  public unfixCameraPosition() {
    settingsStore.setState({ fixedCharacterPosition: false })
    if (this._cameraControls) {
      this._cameraControls.enabled = true
    }
  }

  /**
   * カメラ位置をリセットする
   */
  public resetCameraPosition() {
    settingsStore.setState({
      fixedCharacterPosition: false,
      characterPosition: { x: 0, y: 0, z: 0, scale: 1 },
      characterRotation: { x: 0, y: 0, z: 0 },
    })
    if (this._cameraControls) {
      this._cameraControls.enabled = true
    }
    this.resetCamera()
  }

  /**
   * ライトの強度を更新する
   */
  public updateLightingIntensity(intensity: number) {
    if (this._directionalLight) {
      this._directionalLight.intensity = 1.8 * intensity
    }
    if (this._ambientLight) {
      this._ambientLight.intensity = 1.2 * intensity
    }
  }
}