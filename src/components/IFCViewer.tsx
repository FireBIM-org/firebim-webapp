import React, { useEffect, useRef, useState } from 'react';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { Renderer } from '@ifc-lite/renderer';
import apiClient from '../utils/api-client';
import LoadingSpinner from './LoadingSpinner';

interface IFCViewerProps {
  modelId: string;
}

const IFCViewer: React.FC<IFCViewerProps> = ({ modelId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let animationFrameId: number;

    const initViewer = async () => {
      if (!canvasRef.current || !modelId) return;

      try {
        setIsLoading(true);
        setError(null);

        // 1. Initialize Renderer
        const renderer = new Renderer(canvasRef.current);
        rendererRef.current = renderer;

        // 2. Initialize Geometry Processor
        const geometryProcessor = new GeometryProcessor();
        await geometryProcessor.init();

        // 3. Fetch Model
        console.log(`Fetching model ${modelId} for viewer...`);
        const blob = await apiClient.downloadModel(modelId);
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        if (!isMounted) return;

        // 4. Process and Render
        const streaming = geometryProcessor.processStreaming(uint8Array);
        
        for await (const event of streaming) {
          if (!isMounted) break;

          if (event.type === 'start') {
            console.log('Geometry processing started...');
          } else if (event.type === 'batch') {
            renderer.addMeshes(event.meshes, true);
            // Update progress (approximate if we don't have totalEstimate)
            setProgress((prev) => Math.min(prev + 10, 95));
            renderer.render();
          } else if (event.type === 'complete') {
            console.log(`Geometry processing complete. Total meshes: ${event.totalMeshes}`);
            setProgress(100);
            setIsLoading(false);
            renderer.render();
          }
        }

        // 5. Animation loop for interactivity
        const animate = () => {
          if (rendererRef.current) {
            rendererRef.current.render();
            animationFrameId = requestAnimationFrame(animate);
          }
        };
        animate();

      } catch (err) {
        console.error('Error initializing IFC viewer:', err);
        if (isMounted) {
          setError('Failed to load the 3D model. Make sure your browser supports WebGPU.');
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      isMounted = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (rendererRef.current) {
        // rendererRef.current.destroy(); 
      }
    };
  }, [modelId]);

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden h-[600px] shadow-lg border border-gray-700">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 bg-opacity-70 text-white">
          <LoadingSpinner />
          <p className="mt-4 text-sm font-medium">Loading 3D Model... {progress > 0 && `${progress}%`}</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 bg-opacity-70 text-white p-4 text-center">
          <svg className="h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <canvas 
        ref={canvasRef} 
        className="w-full h-full outline-none" 
        style={{ display: error ? 'none' : 'block' }}
      />
      
      {!isLoading && !error && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">
          Interactive 3D View (WebGPU)
        </div>
      )}
    </div>
  );
};

export default IFCViewer;
