import { GeometryProcessor } from '@ifc-lite/geometry'
import { Renderer } from '@ifc-lite/renderer'
import React, { useEffect, useRef, useState } from 'react'

import apiClient from '../utils/api-client'
import LoadingSpinner from './LoadingSpinner'

function setupCameraControls(canvas: HTMLCanvasElement, renderer: Renderer): () => void {
  const camera = renderer.getCamera()
  let isDragging = false
  let isPanning = false
  let lastX = 0
  let lastY = 0

  const onMouseDown = (event: MouseEvent) => {
    isDragging = true
    isPanning = event.button === 1 || event.button === 2 || event.shiftKey
    lastX = event.clientX
    lastY = event.clientY
    canvas.style.cursor = isPanning ? 'move' : 'grabbing'
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging) return
    const deltaX = event.clientX - lastX
    const deltaY = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY

    if (isPanning) {
      camera.pan(deltaX, deltaY)
    } else {
      camera.orbit(deltaX, deltaY)
    }
  }

  const stopDrag = () => {
    isDragging = false
    isPanning = false
    canvas.style.cursor = 'grab'
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    camera.zoom(event.deltaY)
  }

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', stopDrag)
  canvas.addEventListener('mouseleave', stopDrag)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.style.cursor = 'grab'

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', stopDrag)
    canvas.removeEventListener('mouseleave', stopDrag)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContextMenu)
  }
}

interface IFCViewerProps {
  modelId: string
}

const IFCViewer: React.FC<IFCViewerProps> = ({ modelId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let animationFrameId: number
    let cleanupControls: (() => void) | undefined

    const resize = () => {
      if (!canvasRef.current || !rendererRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      rendererRef.current.resize(width, height)
    }

    const initViewer = async () => {
      if (!canvasRef.current || !modelId) return

      try {
        setIsLoading(true)
        setError(null)

        if (!('gpu' in navigator)) {
          setError('WebGPU is not available in this browser. Try a recent Chromium-based browser.')
          setIsLoading(false)
          return
        }

        // 1. Initialize Renderer
        const renderer = new Renderer(canvasRef.current)
        rendererRef.current = renderer
        await renderer.init()

        if (!isMounted) {
          renderer.destroy()
          return
        }

        // Initialize Controls and Resize
        cleanupControls = setupCameraControls(canvasRef.current, renderer)
        window.addEventListener('resize', resize)
        resize()

        // Animation loop for interactivity (allows orbiting while loading)
        const animate = () => {
          if (rendererRef.current) {
            rendererRef.current.render()
            animationFrameId = requestAnimationFrame(animate)
          }
        }
        animate()

        // 2. Initialize Geometry Processor
        const geometryProcessor = new GeometryProcessor()
        await geometryProcessor.init()

        // 3. Fetch Model
        console.log(`Fetching model ${modelId} for viewer...`)
        const blob = await apiClient.downloadModel(modelId)
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        if (!isMounted) return

        // 4. Process and Render
        const streaming = geometryProcessor.processStreaming(uint8Array)

        for await (const event of streaming) {
          if (!isMounted) break

          if (event.type === 'start') {
            console.log('Geometry processing started...')
          } else if (event.type === 'batch') {
            renderer.addMeshes(event.meshes, true)
            // Update progress (approximate if we don't have totalEstimate)
            setProgress((prev) => Math.min(prev + 10, 95))
          } else if (event.type === 'complete') {
            console.log(`Geometry processing complete. Total meshes: ${event.totalMeshes}`)
            setProgress(100)
            setIsLoading(false)
            renderer.fitToView()
          }
        }
      } catch (err) {
        console.error('Error initializing IFC viewer:', err)
        if (isMounted) {
          setError('Failed to load the 3D model. Make sure your browser supports WebGPU.')
          setIsLoading(false)
        }
      }
    }

    initViewer()

    return () => {
      isMounted = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('resize', resize)
      if (cleanupControls) {
        cleanupControls()
      }
      if (rendererRef.current) {
        rendererRef.current.destroy()
      }
    }
  }, [modelId])

  return (
    <div className='relative h-[600px] overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-lg'>
      {isLoading && (
        <div className='bg-opacity-70 absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 text-white'>
          <LoadingSpinner />
          <p className='mt-4 text-sm font-medium'>Loading 3D Model... {progress > 0 && `${progress}%`}</p>
        </div>
      )}

      {error && (
        <div className='bg-opacity-70 absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-4 text-center text-white'>
          <svg className='mb-4 h-12 w-12 text-red-500' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            />
          </svg>
          <p className='text-sm font-medium'>{error}</p>
        </div>
      )}

      <canvas ref={canvasRef} className='h-full w-full outline-none' style={{ display: error ? 'none' : 'block' }} />

      {!isLoading && !error && (
        <div className='bg-opacity-50 absolute bottom-4 left-4 rounded border border-white/10 bg-black px-3 py-2 text-xs text-white backdrop-blur-sm'>
          <p className='mb-1 font-semibold'>Interactive 3D View (WebGPU)</p>
          <ul className='space-y-0.5 text-[10px] opacity-80'>
            <li>• Left drag: orbit</li>
            <li>• Shift / right / middle drag: pan</li>
            <li>• Wheel: zoom</li>
          </ul>
        </div>
      )}
    </div>
  )
}

export default IFCViewer
