/**
 * @license
 * Copyright 2010-2023 Three.js Authors
 * SPDX-License-Identifier: MIT
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const loggingConstructs = false;
const loggingPlacement = false;

const PLANE_XY = "XY";
const PLANE_XZ = "XZ";
const PLANE_YZ = "YZ";

let labelFont;
let fontLoaded = false;
let labels = [];

let   pointSeparation = 0.05;
let   ballSafeDistance = 3;
let   defaultTrackColor = "grey";
let   layout;
let   switches = { };
let   gens = { };
let   definedColors = {};
let   blocks = { };
let   vars = { };

function cvcos( degrees ) {
	return Math.cos(degrees / 180 * 3.14159);
}

function cvsin( degrees ) {
	return Math.sin(degrees / 180 * 3.14159);
}

function pointFor( track, index) {
	return track.points[index];	
}

function move( vehicle ) {

	let distance = vehicle.speed + vehicle.getSafeDistance();
	let furthest = movePlaces(vehicle, vehicle.point, distance);
	
	if (furthest.count < vehicle.getSafeDistance()) {
		return;
	}
	
	vehicle.track.setOccupied( vehicle, false);
	
	let targetPoint = vehicle.point + vehicle.speed;
	while (targetPoint > (vehicle.track.getNumberOfPoints() - 1) ) {
		vehicle.track.crossedBy(vehicle);
		targetPoint = targetPoint - vehicle.track.points.length;
		vehicle.track = vehicle.track.getNextTrack(vehicle);
	}
	vehicle.point = targetPoint;
	
	vehicle.track.setOccupied( vehicle, true);

	if (vehicle.active) {
		vehicle.reposition();
	}

}
	
function movePlaces( vehicle, point, count ) {
	
	let currentTrack = vehicle.track;
	let currentPoint = point;
	let result = { currentTrack, point, count: 0};	
	for (let i = 1; i <= count; i++) {
		
	   	currentPoint++;
	   	if (currentPoint >= currentTrack.getNumberOfPoints()) {
			currentPoint = 0;
			let lastTrack = currentTrack;
			currentTrack = currentTrack.getNextTrack(vehicle);
			while (currentTrack.getNumberOfPoints() == 0) {
				// pass over switches
//				currentTrack.crossedBy(vehicle);
				if (!currentTrack.isPrevTrack(lastTrack)) {
					return result;
				}
				currentTrack = currentTrack.getNextTrack(vehicle);
			}					   
	   	}				
		
	   	if ( currentTrack.isOccupied(currentPoint) ) {
			   return result;
	   	}	

		result = { currentTrack, currentPoint, count: i};

	}	
	
	return result;	
		
}

function lookup( jobj , field , defaultValue ) {
	
	let result = defaultValue;
	if (jobj.hasOwnProperty(field)) {
		result = jobj[field];
	}	
	let buf = "" + result;
	if (buf.charAt(0) == '$') {
		result = buf;
		const property = result.substring(1);
		result = vars[property];
	}
	return result;
	
}

function defineColor(name, r , g , b ) {
	let single = r*16*16*16*16  + g*16*16 + b;
	definedColors[name] = single;
}

function lookupColor(name) {
	if (definedColors.hasOwnProperty(name)) {
		return definedColors[name];
	}
	return 15*16*16*16*16 + 15*16*16 + 15;
}

function onPointerUp( event ) {

	layout.onPointerUp(event);

}

class TextLabel {

	constructor ( jobj ) {
		this.text  =  jobj["text"];
		this.color =  jobj["color"];
		this.x     =  jobj["x"];
		this.y     =  jobj["y"];
		this.z     =  jobj["z"];
		this.active = true;
	}

	getDisplayableObject( ) {

		const aLabel = new TextGeometry( this.text, 
											{ font: labelFont, 
											  size: 0.5, 
											  height: 0.2,
											  curveSegments: 12,
											  } );

		const material = new THREE.MeshPhongMaterial(  { color: this.color }  );

		this.textmesh = new THREE.Mesh( aLabel, material );
		this.textmesh.scale.set( 0.1, 0.1, 0.1);
		this.textmesh.position.x = this.x;
		this.textmesh.position.y = this.y;
		this.textmesh.position.z = this.z;

		return [ this.textmesh ];

	}

	move() {
//		this.textmesh.rotation.x += 0.01;
//		this.textmesh.rotation.y += 0.01;
//		this.textmesh.rotation.z += 0.01;
	}

}

class TrackVector {

	constructor( x, y, z, neswAngle, plane) {
		this.x = x;
		this.y = y;
		this.z = z; 
		this.neswAngle = neswAngle;
		this.plane = plane;
	}	
	
	asString() {
		return "( ("+this.x+","+this.y+","+this.z+") "+this.neswAngle+" on the "+this.plane+" plane )";
	}
}

class SimpleTrackLayout {
	
	constructor( config, window) {
		
		this.config = config;
		this.fluid = [ ];
		this.fixed = [ ];
		this.nextStep = 0;
		this.msPerStep = 5;
		this.window = window;
		this.rcPointer = null;
		this.running = true;
		
		if (!config.hasOwnProperty("camera")) {
			config.camera = { };	
		}
		
		let pos = {};
		if (config.camera.hasOwnProperty("position")) {
			pos = config.camera.position;	
		} else {
			pos = {"x":0,"y":0,"z":3};	
		}
		
		let lookAt = {};
		if (config.camera.hasOwnProperty("lookAt")) {
			lookAt = config.camera.lookAt;	
		} else {
			lookAt = {"x":0,"y":0,"z":0};	
		}
//		if (!config.camera.hasOwnProperty("target")) {
//			config.camera.target = {"x":0,"y":0,"z":0};	
//		}
		
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
		this.camera.position.x = pos.x;
		this.camera.position.y = pos.y;
		this.camera.position.z = pos.z;
		this.camera.lookAt(lookAt);

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		
		this.controls = new OrbitControls( this.camera, this.renderer.domElement );
		this.controls.listenToKeyEvents(window);
		this.camera.position.set( pos.x , pos.y , pos.z );
//		this.camera.target = trg;
		this.controls.update();	

		this.raycaster = new THREE.Raycaster();

//		window.addEventListener( 'pointermove', this.onPointerMove );
//		window.addEventListener( 'pointerup', onPointerUp );
		
		layout = this;
		
		this.loadFont();

	}

	onPointerUp( event ) {

		// calculate pointer position in normalized device coordinates
		// (-1 to +1) for both components

		this.rcPointer = new THREE.Vector2();
		this.rcPointer.x = ( event.clientX / this.window.innerWidth ) * 2 - 1;
		this.rcPointer.y = - ( event.clientY / this.window.innerHeight ) * 2 + 1;

	}
	
	getDomElement() {

		return this.renderer.domElement ;
		
	}

    loadFont() {

    	const loader = new FontLoader();
		loader.load( 'fonts/helvetiker_regular.typeface.json', 
						function ( font ) { 
								labelFont = font; 
								fontLoaded = true;
								layout.placeLabels();
								} ,
						function ( xhr ) {  } ,
						function ( err ) { console.log("Font load error: "+err); } 
						 );

	}	
	
	addFixed(f) {
		this.fixed.push( f );
		for (const dob of f.getDisplayableObject()) {
			this.scene.add( dob );
		}
	}

	addFluid(v) {
		this.fluid.push( v );
		let dobjs = v.getDisplayableObject();
		for (let dob of dobjs) {
			this.scene.add( dob );
		}
	}
	
	addLight( action) {
		let lightColor = lookupColor( action["color"] );
		let lightIntensity = lookup( action, "intensity", 1);
		let lightPos = action["position"];
		const light = new THREE.DirectionalLight(lightColor, lightIntensity);
		light.position.set(lightPos.x, lightPos.y, lightPos.z);
		this.scene.add(light);
	}
	
	addStraight( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new StraightTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addLeftCurve( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new LeftCurveTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addRightCurve( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new RightCurveTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addChangePlane( action ) {
		const pc = new PlaneChanger( this.currentTrack.endTv , action );
		this.currentTrack.endTv = pc.endTv;
//		this.previousTrack = this.currentTrack;
//		this.currentTrack = new PlaneChanger( this.currentTrack.endTv , action );
//		this.previousTrack.setNextTrack(this.currentTrack);
//		this.addFixed(this.currentTrack);
//		return this.currentTrack;	
	}
	
	addPainter( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new PainterTrack( this.currentTrack.endTv , action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSwitch( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SwitchTrack( this.currentTrack.endTv , action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addManualSwitch( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new ManualSwitchTrack( this.currentTrack.endTv , action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSortSwitch( label ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SortSwitch( this.currentTrack.endTv , label );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSpraySwitch( label ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SpraySwitch( this.currentTrack.endTv , label );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addStop( jobj ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new StopTrack( this.currentTrack.endTv , jobj );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addBallVehicle( jobj , track , position ) {
		let newBall = new BallVehicle( jobj );
		newBall.position(track, position);
		this.addFluid(newBall);
		return newBall;
	}
	
	addGenerator( jobj ) {
		let jobjtv = jobj["tv"];
		let tv = new TrackVector(jobjtv["x"], jobjtv["y"], jobjtv["z"], jobjtv["neswAngle"], jobjtv["plane"]);
		this.currentTrack = new RegularGenerator(tv, jobj);
		this.addFluid( this.currentTrack );
	}
	
	addPlaceHolder( jobj ) {
		let jobjtv = jobj["tv"];
		let tv = new TrackVector(jobjtv["x"], jobjtv["y"], jobjtv["z"], jobjtv["neswAngle"], jobjtv["plane"]);
		this.currentTrack = new SpraySwitch( tv , jobj );
		this.addFluid( this.currentTrack );
	}
	
	addDisposal( jobj ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new Disposal(this.currentTrack.endTv, jobj);
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid( this.currentTrack );
		return this.currentTrack;	
	}
	
	addVars( jobj ) {
		for (const property in jobj.values) {
			vars[property] = jobj.values[property];
		}
	}
	
	setCurrentTrack( label ) {
		let track = switches[label];
		this.currentTrack = track;
	}
	
	getCurrentTrack() {
		return this.currentTrack;
	}
	
	connectTo( label ) {
		if (!switches.hasOwnProperty(label)) {
			console.log("Undefined label: "+label);
		}
		let track = switches[label];
		this.currentTrack.setNextTrack(track);
		track.setPrevTrack(this.currentTrack);
		this.setCurrentTrack( label );
		const xd = this.currentTrack.endTv.x - track.tv.x;
		const yd = this.currentTrack.endTv.y - track.tv.y;
		const zd = this.currentTrack.endTv.z - track.tv.z;
		const dist = Math.sqrt(xd*xd + yd*yd + zd*zd);
		if (dist > 0.01) {
			console.log("Too far apart: "+this.currentTrack.endTv.asString()+" -> ("+track.label+") "+track.tv.asString()+"  "+dist);
			this.currentTrack.color = 0xff0000;
		}
	}
	
	move( timestamp ) {

		if (timestamp < this.nextStep) {
			return;
		}

		if (this.simulationRunning()) {

			this.nextStep = timestamp + this.msPerStep;
						
			let newFluid = [];
			for (let v of this.fluid) {
  				v.move();
 	 			if (v.active) {
					newFluid.push(v);	  
				}
			}
		
			this.fluid = newFluid;
			
		}

		this.renderer.render( this.scene, this.camera );

	}
	
	layout() {
		
		this.performBlock(this.config["layout"]);
		
	}
	
	performBlock ( block ) {
		
		for( let i = 0; i < block.length; i++) {
    		this.performAction(block[i]);
		}
		
	}
	
	simulationRunning() {
		return this.running;
	}
	
	toggleSimulation() {
		this.running = !this.running;
	}
	
	toggleGenerator( id ) {
		gens[id].toggle();
	}
	
	generatorEnabled( id ) {
		return gens[id].enabled;
	}
	
	toggleSwitch( id , choice ) {
		switches[id].switch(choice);
	}
	
	switchSetting( id , choice ) {
		return switches[id].outIndex == choice;	
	}
	
	performAction( action ) {
		
		let type = action["type"];
		
		if (type === "setting") {
			let name = action["name"];
			if (name === "pointSeparation") {
				pointSeparation = action["value"];
				return;
			}			
			if (name === "ballSafeDistance") {
				ballSafeDistance = action["value"];
				return;
			}			
			if (name === "defaultTrackColor") {
				defaultTrackColor = action["value"];
				return;
			}			
			console.log("Unknown setting: "+name);
			return;
		}
		
		if (type === "defineColor") {
			defineColor(action["name"] ,lookup(action,"r",0) ,lookup(action,"g",0) ,lookup(action,"b",0));
			return;			
		}
		
		if (type === "generator") {
			this.addGenerator(action);
			return;			
		}
		
		if (type === "straight") {
			this.addStraight( action );			
			return;			
		}
		
		if (type === "painter") {
			this.addPainter( action );			
			return;			
		}
		
		if (type === "left") {
			this.addLeftCurve( action );
			return;			
		}
		
		if (type === "right") {
			this.addRightCurve( action );
			return;			
		}
		
		if (type === "disposal") {
			this.addDisposal( action );
			return;			
		}
		
		if (type === "switch") {
			this.addSwitch( action );
			return;			
		}
		
		if (type === "placeHolder") {
			this.addPlaceHolder( action );
			return;			
		}
		
		if (type === "manualSwitch") {
			this.addManualSwitch( action );
			return;			
		}
		
		if (type === "sprayer") {
			this.addSpraySwitch( action );
			return;			
		}
		
		if (type === "sort") {
			this.addSortSwitch( action );
			return;			
		}
		
		if (type === "stop") {
			this.addStop( action );
			return;			
		}
		
		if (type === "plane") {
			this.addChangePlane( action );
			return;			
		}
		
		if (type === "connectTo") {
			this.connectTo( action["label"] );
			return;			
		}
		
		if (type === "setCurrent") {
			this.setCurrentTrack( lookup(action, "label", "missing_label") );
			return;			
		}
		
		if (type === "light") {
			this.addLight( action );
			return;			
		}
		
		if (type === "vars") {
			this.addVars( action );
			return;			
		}
		
		if (type === "block") {
			const label = action["label"];
			blocks[label] = action["layout"];
			return;			
		}
		
		if (type === "run") {
			const label = action["label"];
			let repeat = lookup( action, "repeat" , 1);
			for (let i = 0; i < repeat; i++) {
				this.performBlock( blocks[label]);
			}
			return;			
		}
		
		if (type === "log") {
			console.log(action["message"]);
			return;			
		}
		
	}
	
	getFixed() {
		return this.fixed;
	}
	
	getFluid() {
		return this.fluid;
	}
	
	placeText( text , color, x , y , z) {

		labels.push ( { text: text, color: color, x: x, y: y, z: z } );		
		
	}
	
	placeLabels( ) {
		
		for (let l of labels) {
			this.addFluid( new TextLabel(l) );
		}
		
	}
	
	
}

class Track {
	constructor ( tv ) {
		this.tv = tv;
		this.points = [];
		this.places = [];
	} 	

	getNextTrack(vehicle) {
		return this.nextTrack;
	}

	setNextTrack( track ) {
		this.nextTrack = track;
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevTrack;	
	}
	
	setPrevTrack( track ) {
		this.prevTrack = track;
	}

	getNumberOfPoints() {
		return this.points.length;
	}
	
	isOccupied( point ) {
		return this.places[point];
	}
	
	setOccupied( vehicle , taken) {
		this.places[vehicle.point] = taken;
	}
	
	isPrevTrack( track ) {
		return track === this.prevTrack;
	}
	
	logConstruct( text ) {
		if (loggingConstructs) {
			console.log(text+",");
		}
	}
	
	logPlacement( text ) {
		if (loggingPlacement) {
			console.log(text);
		}
	}
	
	crossedBy( vehicle ) {
		
	}

	toNesw() {
		
		let cvc = cvcos(this.tv.neswAngle);
		let cvs = cvsin(this.tv.neswAngle);

		if (cvc > 0.999) {
			this.tv.neswAngle = 0;
			this.tv.dir = "E";
		} else if (cvc < -0.999) {
			this.tv.neswAngle = -180;
			this.tv.dir = "W";
		} else if (cvs > 0.999) {
			this.tv.neswAngle = 90;
			this.tv.dir = "N";
		} else if (cvs < -0.999) {
			this.tv.neswAngle = -90;
			this.tv.dir = "S";
		} else {
			return false; 	
		}
		
		return true;
		
	}
	
	xFrom( tv ) {
		if (tv.plane == PLANE_XY) {
			return tv.x;
		} else if (tv.plane == PLANE_XZ) {
			return tv.x;
		} else if (tv.plane == PLANE_YZ) {
			return tv.y;
		} else {
			console.log("Bad plane: "+JSON.stringify(tv));
		}
		return 0;
	}
	
	yFrom( tv ) {
		if (tv.plane == PLANE_XY) {
			return tv.y;
		} else if (tv.plane == PLANE_XZ) {
			return tv.z;
		} else if (tv.plane == PLANE_YZ) {
			return tv.z;
		} else {
			console.log("Bad plane: "+JSON.stringify(tv));
		}
		return 0;
	}
	
	zFrom( tv ) {
		if (tv.plane == PLANE_XY) {
			return tv.z;
		} else if (tv.plane == PLANE_XZ) {
			return tv.y;
		} else if (tv.plane == PLANE_YZ) {
			return tv.x;
		} else {
			console.log("Bad plane: "+JSON.stringify(tv));
		}
		return 0;
	}

	place( pointsArray ) {
		
		this.points = [];
		this.places = [];

		for (let i =0; i < pointsArray.length; i++) {
   			let xformed = {};
   			if (this.tv.plane === PLANE_XY) {
				xformed.x = pointsArray[i].x;	   
				xformed.y = pointsArray[i].y;	   
				xformed.z = this.zFrom(this.tv);	   
			} else if (this.tv.plane === PLANE_XZ) {
				xformed.x = pointsArray[i].x;	   
				xformed.y = this.zFrom(this.tv);	   
				xformed.z = pointsArray[i].y;	   
			} else if (this.tv.plane === PLANE_YZ) {
				xformed.x = this.zFrom(this.tv);	   
				xformed.y = pointsArray[i].x;	   
				xformed.z = pointsArray[i].y;	   
			} else {
				console.log("Bad plane: "+this.tv.plane);
			}
   			this.points.push( xformed );
   			this.places.push( false);
		}

	}

	transform( tv ) {

		let vx = tv.x;
		let vy = tv.y;
		let vz = tv.z;
		
  		if (tv.plane === PLANE_XY) {
			tv.x = vx;	   
			tv.y = vy;	   
			tv.z = vz;	   
		} else if (tv.plane === PLANE_XZ) {
			tv.x = vx;	   
			tv.y = vz;	   
			tv.z = vy;	   
		} else if (tv.plane === PLANE_YZ) {
			tv.x = vz;	   
			tv.y = vx;	   
			tv.z = vy;	   
		} else {
			console.log("Bad plane: "+this.tv.plane);
		}

		return tv;
	}
}

const changeConfig = {
		"XY": {
				"XY":{ "N": true, "E": true,  "S":true, "W":true,  "delta":0 },
				"XZ":{ "N": false, "E": true, "S":false, "W":true, "delta":0 },
				"YZ":{ "N": true, "E": false, "S":true, "W":false, "delta":-90 },
			},
		"XZ": {
				"XY":{ "N": false, "E": true,  "S":false, "W":true,  "delta":0 },
				"XZ":{ "N": true, "E": true,  "S":true, "W":true, "delta":0 },
				"YZ":{ "N": true, "E": false, "S":true, "W":false, "delta":0 },
			},
		"YZ": {
				"XY":{ "N": false, "E": true, "S":false, "W":true, "delta":90 },
				"XZ":{ "N": true, "E": false, "S":true, "W":false, "delta":0 },
				"YZ":{ "N": true, "E": true,  "S":true, "W":true,  "delta":0 },
			},
		};

class PlaneChanger extends Track {
	
	constructor ( tv, jobj ) {
		super (tv);
		this.points = [];
		this.places = [];
		this.newPlane = jobj["plane"]; 
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		
		if (!this.toNesw()) {
			console.log("Can't change planes if dir is not N, S, E or W: "+JSON.stringify(jobj));
		}

		let xformConfig = changeConfig[tv.plane]; 
		xformConfig = xformConfig[this.newPlane];
		
		if (!xformConfig[this.tv.dir]) {
			console.log("Invalid plane change: "+tv.plane+" --> "+this.newPlane);
		}

		this.endTv = new TrackVector( tv.x, tv.y, tv.z, tv.neswAngle+xformConfig["delta"], this.newPlane);
	} 	
	getDisplayableObject( ) {
		return [  ];	
	}

}

class PainterTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.color =  lookupColor( jobj["color"] );
		this.type = "painter";
		this.logConstruct(JSON.stringify(this));
		this.points = [];
		this.places = [];
		this.endTv = tv;
		this.active = true;
	}

	getDisplayableObject( ) {

//		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 7, 7 ), new THREE.MeshBasicMaterial( { color: this.color } ) ); 
//		this.mesh.position.set(this.tv.x,this.tv.y,this.tv.z);
//		return [ this.mesh ];
		
		
		var geo = new THREE.WireframeGeometry( new THREE.SphereGeometry( 0.01, 3, 3 ) ); // or WireframeGeometry( geometry ) EdgesGeometry
		var mat = new THREE.LineBasicMaterial( { color: this.color, linewidth: 2 } );
		this.wireframe = new THREE.LineSegments( geo, mat );
		this.wireframe.position.set(this.tv.x,this.tv.y,this.tv.z);

		this.logPlacement(this.type+": on "+this.tv.asString());
		
		this.wireframe.userData = { "mtKind": this.type };

		return [ this.wireframe ];

	}

	move() {
		this.wireframe.rotation.x += 0.02;
		this.wireframe.rotation.y += 0.01;
	}
	
	isPrevTrack( track ) {
		return true;
	}
	
	crossedBy( vehicle ) {
//		vehicle.changeColor(this.color);
		vehicle.ballMesh.material.color.set(this.color);
		vehicle.color = this.color;
	}

}

class StopTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.type = "stop";
		this.frequency = jobj["frequency"];
		this.starts = jobj["starts"];
		this.stops = jobj["stops"];
		this.logConstruct(JSON.stringify(this));
		this.counter = 0;
		this.color = this.red();
		this.open = false;
		this.points = [];
		this.places = [];
		this.endTv = tv;
		this.active = true;
	}

	getDisplayableObject( ) {
		
		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: this.color } ) ); 
		this.mesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		this.mesh.userData = { "mtKind": this.type };
		
		return [ this.mesh ];

	}

	move() {
		this.counter++;
		if (this.counter >= this.frequency) {
			this.counter = 0;
		}
		if (this.counter == this.starts) {
			this.open = true;
			this.color = this.green();
			this.mesh.material.color.set( this.color );
//			this.mesh.material.color.setHex( 0xc24a4a );
		}
		if (this.counter == this.stops) {
			this.open = false;
			this.color = this.red();
			this.mesh.material.color.set( this.color );
		}
	}
	
	green() {
		return 0x00ff00;
	}
	
	
	red() {
		return 0xff0000;
	}
	
	isPrevTrack( track ) {
		return this.open;
	}

}

class SwitchTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.label = jobj["label"];
		this.type = "switch";
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.outIndex = 0;
		this.outEvery = lookup( jobj , "every" , 37);
		this.counter = 0;
		this.active = true;
		switches[this.label] = this;

		this.desc   = lookup(jobj, "desc", this.label);
		this.labelOffset = lookup(jobj, "labelOffset", {"x":0.1,"y":0.1,"z":0.1} );
//		layout.placeText(this.desc, 0xffffff, tv.x+this.labelOffset.x,tv.y+this.labelOffset.y,tv.z+this.labelOffset.z);
	}

	getDisplayableObject( ) {

		const soMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: 0x888888 } ) ); 
		soMesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		soMesh.userData = { "mtKind": this.type };
		
		return [ soMesh ];

	}

	move() {
		this.counter++;
		if ((this.counter % this.outEvery) == 0) {
			this.outIndex++;
			if (this.outIndex >= this.nexts.length) {
				this.outIndex = 0;
			}
		}
	}
	
	getNextTrack(vehicle) {
		return this.nexts[this.outIndex];	
	}
	
	setNextTrack( track ) {
		this.nexts.push( track );
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevs[this.inIndex];	
	}
	
	setPrevTrack( track ) {
		this.prevs.push( track );
	}
	
	isPrevTrack( track ) {
		return true;
	}

}

class ManualSwitchTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.label = lookup(jobj, "label", "missing_label");
		this.desc   = lookup(jobj, "desc", this.label);
		this.type = "manualSwitch";
		this.labelOffset = lookup(jobj, "labelOffset", {"x":0.1,"y":0.1,"z":0.1} );
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.outIndex = 0;
		this.active = true;
		switches[this.label] = this;
		
		layout.placeText(this.desc, 0xffffff, tv.x+this.labelOffset.x,tv.y+this.labelOffset.y,tv.z+this.labelOffset.z);
	}

	getDisplayableObject( ) {

		const soMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: 0x888888 } ) ); 
		soMesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());

		soMesh.userData = { "mtClickable": this.label, "mtKind": this.type };
				
		return [ soMesh ];

	}

 	move() {

	}

 	switch( choice ) {
		this.outIndex = Number(choice);
	}
	
	getNextTrack(vehicle) {
		return this.nexts[this.outIndex];	
	}
	
	setNextTrack( track ) {
		this.nexts.push( track );
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevs[this.inIndex];	
	}
	
	setPrevTrack( track ) {
		this.prevs.push( track );
	}
	
	isPrevTrack( track ) {
		return true;
	}

}

class SortSwitch extends SwitchTrack {
	
	constructor ( tv , jobj ) {
		super (tv , jobj);
		this.label = jobj["label"];
		this.type = "sort";
		this.defaultColor = lookupColor( lookup(jobj, "defaultColor", defaultTrackColor));
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.nextTracks = {};
		this.active = true;
	}

	move() {

	}
	
	getNextTrack(vehicle) {

		if (this.nextTracks.hasOwnProperty(vehicle.color)) {
			return this.nextTracks[vehicle.color];
		}
		if (this.nextTracks.hasOwnProperty(this.defaultColor)) {
			return this.nextTracks[this.defaultColor];
		}
		return this;	
	}
	
	setNextTrack( track ) {
		this.nextTracks[track.color] = track;
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevTrack;	
	}
	
	setPrevTrack( track ) {
		this.prevTrack = track;
	}
	
}

class SpraySwitch extends SwitchTrack {
	
	constructor ( tv , jobj ) {
		super (tv , jobj);
		this.label = jobj["label"];
		this.random = lookup(jobj, "random", true);
		this.type = "spray";
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.active = true;
	}

	move() {

	}
	
	crossedBy( vehicle ) {
		if (this.random) {
			this.outIndex = Math.floor(Math.random()*this.nexts.length);
		} else {
			this.outIndex++;
			if (this.outIndex >= this.nexts.length) {
				this.outIndex = 0;
			}
		}
	}
	
}


class StraightTrack extends Track  {
	
	constructor ( tv, jobj ) {
		super(tv);
		this.length = jobj["length"];
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		this.type = "straight";
		this.logConstruct(JSON.stringify(this));
	}

	getDisplayableObject( ) {
		
		let linePoints = Math.ceil(this.length / pointSeparation);

		let deltaX = (this.length * cvcos(this.tv.neswAngle)) / linePoints;
		let deltaY = (this.length * cvsin(this.tv.neswAngle)) / linePoints;

		let vx = this.xFrom(this.tv);
		let vy = this.yFrom(this.tv);
		let vz = this.zFrom(this.tv);
		
		let pointArray = [];
		for (let i =0; i <= linePoints; i++) {
			let point = {  
					"x": deltaX * i + vx, 
					"y": deltaY * i + vy, 
					"z": vz };
   			pointArray.push(point);
		}
		
		this.place(pointArray);
		
		const stPoints = [];
		stPoints.push( this.points[0] );
		let lastPoint = this.points[this.points.length-1];
		stPoints.push( lastPoint );

		this.endTv = new TrackVector(lastPoint.x, lastPoint.y, lastPoint.z, this.tv.neswAngle, this.tv.plane);
			
		const lineMaterial = new THREE.LineBasicMaterial( { color: this.color } );
		const lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		const line = new THREE.Line( lineGeometry, lineMaterial );
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		line.userData = { "mtKind": this.type };
		
		return [ line ];
	}

}

class CurveTrack extends Track {
	
	constructor ( tv, jobj ) {
		super(tv);
		this.radius = jobj["radius"];
		this.angle =  jobj["angle"];
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		this.calculateSpecifics();
		this.endTv = this.calculateEndTv(); 
		this.jobj = jobj;
		this.logConstruct(JSON.stringify(this));
	}

	calculateSpecifics() {
		// Must be overridden
		return { }; 	
	}
	
	calculateEndTv() {
		// Must be overridden
		
		// new TrackVector(ex, ey, tv.z, ea, tv.elevAngle);
		return {};
	}
	
	calculateStuffXY(x, y, currentAngle, counterClockwise) {
		// x, y are primary and seconday axis values from tv
		// currentAngle is either neswAngle or elevAngle
		// clockwise is true for left and up
		// deltaAngle is the arc of the track
		// use radius from the object
		
		this.calc = {};
		
		let mirror = -1;
		if (counterClockwise) {
			mirror = 1;	
		}

		this.calc.cx = x + (cvcos(currentAngle+(90*mirror)) * this.radius);
		this.calc.cy = y + (cvsin(currentAngle+(90*mirror)) * this.radius);
		
		const beta = currentAngle + (this.angle - 90) * mirror;
		
		this.calc.ex = this.calc.cx + (cvcos(beta) * this.radius);
		this.calc.ey = this.calc.cy + (cvsin(beta) * this.radius);
		
		this.calc.newAngle = currentAngle + (this.angle * mirror);
		
		this.calc.fromAngle = (currentAngle - (90*mirror))  / 180 * Math.PI;
		this.calc.toAngle =  (currentAngle + ((this.angle - 90)*mirror))  / 180 * Math.PI;
	
		const curve = new THREE.EllipseCurve(
								this.calc.cx,  this.calc.cy, 
								this.radius, this.radius,
 								this.calc.fromAngle,  this.calc.toAngle ,
								!counterClockwise,       // aClockwise
								0                 // aRotation
							);
	
		this.lcNum = Math.ceil(Math.PI * 2 * this.radius * this.angle / 360 / pointSeparation) + 1;
		let pointsArray = curve.getPoints( this.lcNum );
		
		this.place( pointsArray);
	
	}
	
	calculateStuffNonXY(x, y, currentAngle, isRightOrDown) {
		// x, y are primary and seconday axis values from tv
		// currentAngle is either neswAngle or elevAngle
		// clockwise is true for left and up
		// deltaAngle is the arc of the track
		// use radius from the object
		
		this.calc = {};
		
		// nesw should be one of 0, 90 , -90 and -180
		
		let sgn01 = 1;  // sign for cx calc.
		let sgn02 = 1;  // sign for angle +/- for center calc
		let sgn03 = 1;  // 
		let clockwise = true;
		
		let nesw = this.tv.neswAngle;
		
		if ((cvcos(nesw) < 0) | (cvsin(nesw) < 0)) {
			sgn01 = -1;
		}
		
		if (isRightOrDown) {
			sgn02 = -1;
			clockwise = false;
		}
		
		sgn03 = 0 - sgn02;  // ??

		if (sgn01 == 1) {
			clockwise = !isRightOrDown;
		} else {
			clockwise = isRightOrDown;
		}

		this.calc.cx = x + (cvcos(currentAngle+(90*sgn02)) * this.radius * sgn01);
		this.calc.cy = y + (cvsin(currentAngle+(90*sgn02)) * this.radius);
		
		this.calc.newAngle = currentAngle + this.angle * sgn02; 
		
		this.calc.fromAngle = (currentAngle + (90*sgn03))  / 180 * Math.PI;
		this.calc.toAngle =  (currentAngle + (90*sgn03) - (this.angle * sgn02))  / 180 * Math.PI;
	
		const curve = new THREE.EllipseCurve(
								this.calc.cx,  this.calc.cy, 
								this.radius, this.radius,
 								this.calc.fromAngle,  this.calc.toAngle ,
								clockwise,  
								0                 	// aRotation
							);
	
		this.lcNum = Math.ceil(Math.PI * 2 * this.radius * this.angle / 360 / pointSeparation) + 1;
		this.calc.pointPosition = curve.getPoints( this.lcNum );

		this.calc.ex = this.calc.pointPosition[this.lcNum].x;
		this.calc.ey = this.calc.pointPosition[this.lcNum].y;
	
	}
}

class LeftCurveTrack extends CurveTrack {

	constructor ( tv, jobj ) {
		super(tv, jobj);
		this.type = "left";
	}

	calculateSpecifics() {
		
		let vx = this.xFrom(this.tv);
		let vy = this.yFrom(this.tv);

		this.calculateStuffXY(vx, vy, this.tv.neswAngle, true);		
	}
	
	calculateEndTv() {
		let lastPoint = this.points[this.points.length-1];
		return new TrackVector(lastPoint.x, lastPoint.y, lastPoint.z, this.calc.newAngle, this.tv.plane);
//		return this.transform( new TrackVector(this.calc.x, this.calc.ey, this.tv.z, this.calc.newAngle, this.tv.plane) );
	}
	
	getDisplayableObject( ) {

		const geometry = new THREE.BufferGeometry().setFromPoints( this.points );
		const material = new THREE.LineBasicMaterial( { color: this.color } );
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		let cline = new THREE.Line( geometry, material );
		cline.userData = { "mtKind": this.type };
		
		return [ cline ];

	}
		
}

class RightCurveTrack extends CurveTrack {

	constructor ( tv, jobj ) {
		super(tv, jobj);
		this.type = "left";
	}

	calculateSpecifics() {

		let vx = this.xFrom(this.tv);
		let vy = this.yFrom(this.tv);

		this.calculateStuffXY(vx, vy, this.tv.neswAngle, false);		
	}
	
	calculateEndTv() {
		let lastPoint = this.points[this.points.length-1];
		return new TrackVector(lastPoint.x, lastPoint.y, lastPoint.z, this.calc.newAngle, this.tv.plane);
//		return this.transform( new TrackVector(this.calc.ex, this.calc.ey, this.tv.z, this.calc.newAngle, this.tv.plane) );
	}
	
	getDisplayableObject( ) {

		const geometry = new THREE.BufferGeometry().setFromPoints( this.points );
		const material = new THREE.LineBasicMaterial( { color: this.color } );
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		let cline = new THREE.Line( geometry, material );
		cline.userData = { "mtKind": this.type };
		
		return [ cline ];

	}
	
}


class RegularGenerator extends Track {
	
	constructor ( tv , jobj ) {
		super(tv);
		this.every 	= lookup(jobj, "every", 10);
		this.max 	= lookup(jobj, "max" , -1);
		this.label  = jobj["label"];
		this.desc   = lookup(jobj, "desc", this.label);
		this.balls = [];
		let jarr = jobj["balls"];
		for( let i = 0; i < jarr.length; i++) {
    		this.balls.push(jarr[i]);
		}
		this.type = "generator";
		this.index = 0;
		this.created = 0;
		this.colorsIndex = 0;
		this.endTv = tv;
		this.active = true;
		this.enabled = true;
		gens[this.label] = this;
		
		if (jobj.hasOwnProperty("label")) {
			layout.placeText(this.desc, 0xdddddd, tv.x+0.1,tv.y+0.1,tv.z+0.1);
		}
	}

	getDisplayableObject( ) {

		let firstBall = this.balls[0];
		let genColor = lookupColor(firstBall["color"]);
		if (this.balls.length > 1) {
			genColor = 0xffffff;
		}
		this.ballMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.06, 4, 4 ), new THREE.MeshPhongMaterial( { color: genColor } ) ); 
		this.ballMesh.position.set(this.tv.x, this.tv.y, this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		this.ballMesh.userData = { "mtKind": this.type };
		
		return [ this.ballMesh ];

	}

	move() {
		this.index++;
		if (this.index >= this.every) {
			this.index = 0;
			this.created ++;
			if ((this.max == -1) | (this.max >= this.created)) {
				if (this.nextTrack.isOccupied(0) | !this.enabled) {
					this.created--;
					return;
				}
				this.colorsIndex++;
				if (this.colorsIndex >= this.balls.length) {
					this.colorsIndex = 0;
				}
				let currentBall = this.balls[this.colorsIndex];
				let newBall = layout.addBallVehicle( currentBall, this.nextTrack, 0 );
				this.nextTrack.setOccupied(newBall, true);
			}
		}
	}

	toggle() {
		this.enabled = !this.enabled;
	}
}

class Disposal extends Track {
	
	constructor ( tv , jobj ) {
		super(tv);
		this.type = "disposal";
		this.logConstruct(JSON.stringify(this));
		this.active = true;
		this.endTv = tv;
	}

	getDisplayableObject( ) {

		const arm = 0.04;
		
		const lineMaterial = new THREE.LineBasicMaterial( { color: 0xff0000 } );
		
		let stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x-arm, this.tv.y+arm, this.tv.z ) );
		stPoints.push( new THREE.Vector3( this.tv.x+arm, this.tv.y-arm, this.tv.z ) );
		let lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line1 = new THREE.Line( lineGeometry, lineMaterial );
		
		stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x-arm, this.tv.y, this.tv.z+arm ) );
		stPoints.push( new THREE.Vector3( this.tv.x+arm, this.tv.y, this.tv.z-arm ) );
		lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line2 = new THREE.Line( lineGeometry, lineMaterial );
		
		stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x, this.tv.y+arm, this.tv.z-arm ) );
		stPoints.push( new THREE.Vector3( this.tv.x, this.tv.y-arm, this.tv.z+arm ) );
		lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line3 = new THREE.Line( lineGeometry, lineMaterial );
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ this.line1 , this.line2 , this.line3 ];

	}

	move() {
//		this.line1.rotation.x += 0.01;
//		this.line2.rotation.y += 0.01;
//		this.line3.rotation.z += 0.01;
	}
	
	getNumberOfPoints() {
		return 10000;
	}
	
	isOccupied( point ) {
		return false;
	}
	
	setOccupied( vehicle , taken) {
		vehicle.active = false;
//		layout.fluid.remove(vehicle);
		layout.scene.remove(vehicle.getSceneObject());
	}

}

class BallVehicle {

	constructor( jobj ) {

		this.maxSpeed 	= lookup( jobj , "maxSpeed" , 1);
		this.color		= lookupColor(jobj["color"]);
		this.speed      = lookup( jobj , "speed" , 1);
		this.safeDistance = lookup( jobj , "ballSafeDistance" , ballSafeDistance);
		this.active 	= true;
		this.type 		= 'Ball';

	}
 
	position (track, point) {
		this.track 		= track;
		this.point 		= point;
	}
	
	reposition() {
		this.ballPoint = pointFor(this.track, this.point);
		this.ballMesh.position.set(this.ballPoint.x, this.ballPoint.y, this.ballPoint.z);
	}
	
	getDisplayableObject( ) {

		this.ballMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 15, 15 ), new THREE.MeshPhongMaterial( { color: this.color } ) ); 
		this.reposition();
		
		this.ballMesh.userData = { "mtKind": this.type };

		return [ this.ballMesh ];

	}
	
	getSceneObject() {
		return this.ballMesh ;
	}
	
	changeColor( newColor) {
		this.ballMesh.color = newColor;
	}
	
	move() {
		move(this);
	}

	getSafeDistance() {
		return this.safeDistance;
	}
}

export { SimpleTrackLayout, BallVehicle , move };
