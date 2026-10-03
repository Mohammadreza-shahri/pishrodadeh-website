const profile = (id, name, purposes, source, guide, defaults = {}) => ({id, name, purposes, source, guide, defaults});
export const gpuSoftware = [
  profile('pytorch', 'PyTorch', ['ai','security'], 'https://pytorch.org/docs/stable/', 'ml'),
  profile('tensorflow', 'TensorFlow', ['ai'], 'https://www.tensorflow.org/guide/gpu', 'ml'),
  profile('whisper', 'OpenAI Whisper', ['ai'], 'https://github.com/openai/whisper', 'speech'),
  profile('paddleocr', 'PaddleOCR', ['ai','vision'], 'https://www.paddleocr.ai/', 'ocr'),
  profile('comfyui', 'ComfyUI', ['generative'], 'https://docs.comfy.org/', 'generation'),
  profile('diffusers', 'Hugging Face Diffusers', ['generative'], 'https://huggingface.co/docs/diffusers/', 'generation'),
  profile('horizon', 'Omnissa Horizon · NVIDIA vGPU', ['vdi'], 'https://docs.omnissa.com/', 'desktop', {sharing:'vgpu'}),
  profile('citrix', 'Citrix Virtual Apps and Desktops · NVIDIA vGPU', ['vdi'], 'https://docs.citrix.com/en-us/citrix-virtual-apps-desktops/graphics', 'desktop', {sharing:'vgpu'}),
  profile('vgpu', 'NVIDIA vGPU', ['vdi','service'], 'https://docs.nvidia.com/vgpu/', 'sharing', {sharing:'vgpu'}),
  profile('mig', 'NVIDIA MIG', ['service'], 'https://docs.nvidia.com/datacenter/tesla/mig-user-guide/', 'sharing', {sharing:'mig'}),
  profile('passthrough', 'VMware vSphere · GPU passthrough', ['service'], 'https://docs.nvidia.com/vgpu/', 'sharing', {sharing:'dedicated'}),
  profile('blender', 'Blender · Cycles', ['render'], 'https://docs.blender.org/manual/en/latest/render/cycles/gpu_rendering.html', 'render'),
  profile('vray', 'V-Ray GPU', ['render'], 'https://docs.chaos.com/', 'render'),
  profile('arnold', 'Autodesk Arnold · GPU', ['render'], 'https://help.autodesk.com/view/ARNOL/ENU/', 'render'),
  profile('omniverse', 'NVIDIA Omniverse', ['twin'], 'https://docs.omniverse.nvidia.com/', 'simulation'),
  profile('unreal', 'Unreal Engine', ['render','twin'], 'https://dev.epicgames.com/documentation/en-us/unreal-engine', 'simulation'),
  profile('ffmpeg', 'FFmpeg · NVIDIA acceleration', ['video'], 'https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/ffmpeg-with-nvidia-gpu/index.html', 'video'),
  profile('gstreamer', 'GStreamer', ['video'], 'https://gstreamer.freedesktop.org/documentation/', 'video'),
  profile('deepstream', 'NVIDIA DeepStream', ['vision'], 'https://docs.nvidia.com/metropolis/deepstream/dev-guide/', 'vision'),
  profile('yolo', 'Ultralytics YOLO', ['vision'], 'https://docs.ultralytics.com/', 'vision'),
  profile('gromacs', 'GROMACS', ['hpc'], 'https://manual.gromacs.org/current/user-guide/mdrun-performance.html', 'scientific'),
  profile('fluent', 'Ansys Fluent', ['hpc'], 'https://www.ansys.com/products/fluids/ansys-fluent', 'scientific'),
  profile('rapids', 'NVIDIA RAPIDS', ['analytics','security'], 'https://docs.rapids.ai/', 'analytics'),
  profile('spark', 'Apache Spark · RAPIDS Accelerator', ['analytics'], 'https://docs.nvidia.com/spark-rapids/', 'analytics'),
];
export const gpuWorkloadExamples = [
  {id:'prediction', purposes:['ai','security']},
  {id:'speech', purposes:['ai']},
  {id:'imageGeneration', purposes:['generative']},
  {id:'videoGeneration', purposes:['generative']},
  {id:'cadDesktop', purposes:['vdi']},
  {id:'creativeDesktop', purposes:['vdi']},
  {id:'teamCompute', purposes:['service']},
  {id:'teamDesktop', purposes:['service']},
  {id:'architecture', purposes:['render']},
  {id:'animation', purposes:['render']},
  {id:'factory', purposes:['twin']},
  {id:'interactiveScene', purposes:['twin']},
  {id:'transcode', purposes:['video']},
  {id:'liveVideo', purposes:['video']},
  {id:'cameraDetection', purposes:['vision']},
  {id:'qualityControl', purposes:['vision']},
  {id:'fluidSimulation', purposes:['hpc']},
  {id:'molecularSimulation', purposes:['hpc']},
  {id:'dataProcessing', purposes:['analytics']},
  {id:'sparkProcessing', purposes:['analytics']},
  {id:'securityAnalysis', purposes:['security']},
];
export function examplesForPurpose(useCase) {
  return gpuWorkloadExamples.filter(item => item.purposes.includes(useCase));
}
export function softwareForPurpose(useCase) {
  return gpuSoftware.filter(item => item.purposes.includes(useCase));
}
export function selectedSoftware(requirements) {
  return softwareForPurpose(requirements.useCase).find(item => item.name === requirements.softwareName) || null;
}
export function applySoftwareProfile(requirements, id) {
  const item = softwareForPurpose(requirements.useCase).find(item => item.id === id);
  if (!item) throw Error('Software profile does not match this GPU purpose');
  return {...requirements, softwareName:item.name, workloadDetails:'', runtimeGB:null, measuredGB:null,
    sharing:'unknown', computeType:'unknown', ...item.defaults};
}
