"use client";

import { useEffect, useRef, useState } from "react";
import { parseSTLPreview, type STLMeshPreview } from "../../../../src/cad/stl-preview";

type ViewControls = { reset: () => void; rotateLeft: () => void; rotateRight: () => void };
type STLLoadState = {
  src: string;
  status: "loading" | "ready" | "error";
  mesh: STLMeshPreview | null;
  error: string | null;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "A preview shader could not be compiled.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createPreviewProgram(gl: WebGLRenderingContext): { program: WebGLProgram; vertex: WebGLShader; fragment: WebGLShader } {
  const vertexSource = [
    "attribute vec3 a_position;",
    "attribute vec3 a_normal;",
    "uniform vec2 u_rotation;",
    "uniform float u_zoom;",
    "varying vec3 v_normal;",
    "vec3 rotateX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }",
    "vec3 rotateY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }",
    "void main() {",
    "  vec3 ֻǱ˞