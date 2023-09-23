import * as THREE from 'three'
import FloorMaterial from '../Materials/Floor.js'

export default class Floor
{
    constructor(_options)
    {
        // Options
        this.debug = _options.debug

        // Container
        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        // Geometry
        this.geometry = new THREE.PlaneBufferGeometry(2, 2, 10, 10)

        // Colors
        this.colors = {}
        this.colors.topLeft = '#000'
        this.colors.topRight = '#000'
        this.colors.bottomRight = '#000'
        this.colors.bottomLeft = '#000'

        // Material
        this.material = new FloorMaterial()

        this.updateMaterial = () =>
        {
            const topLeft = new THREE.Color(this.colors.topLeft)
            const topRight = new THREE.Color(this.colors.topRight)
            const bottomRight = new THREE.Color(this.colors.bottomRight)
            const bottomLeft = new THREE.Color(this.colors.bottomLeft)

            const data = new Uint8Array([
                Math.round(bottomLeft.r * 255), Math.round(bottomLeft.g * 255), Math.round(bottomLeft.b * 255),
                Math.round(bottomRight.r * 255), Math.round(bottomRight.g * 255), Math.round(bottomRight.b * 255),
                Math.round(topLeft.r * 255), Math.round(topLeft.g * 255), Math.round(topLeft.b * 255),
                Math.round(topRight.r * 255), Math.round(topRight.g * 255), Math.round(topRight.b * 255)
            ])

            this.backgroundTexture = new THREE.DataTexture(data, 2, 2, THREE.RGBFormat)
            this.backgroundTexture.magFilter = THREE.LinearFilter
            this.backgroundTexture.needsUpdate = true

            this.material.uniforms.tBackground.value = this.backgroundTexture
        }

        this.updateMaterial()

        // Mesh
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.frustumCulled = false
        this.mesh.matrixAutoUpdate = false
        this.mesh.updateMatrix()
        this.container.add(this.mesh)

        // Debug
        if(this.debug)
        {
            const folder = this.debug.addFolder('floor')
            // folder.open()

            folder.addColor(this.colors, 'topLeft').onChange(this.updateMaterial)
            folder.addColor(this.colors, 'topRight').onChange(this.updateMaterial)
            folder.addColor(this.colors, 'bottomRight').onChange(this.updateMaterial)
            folder.addColor(this.colors, 'bottomLeft').onChange(this.updateMaterial)
        }
    }
}
