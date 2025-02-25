const { isEqual, debounce, isEmpty, isFunction } = lodash;
const { registerBlockType } = wp.blocks;
const { Component, Fragment, RawHTML, createRef } = wp.element;
const { BlockControls } = wp.editor;
const { Toolbar, IconButton, Spinner } = wp.components;
const { __ } = wp.i18n;
const { soPanelsBlockEditorAdmin } = window;

class SiteOriginPanelsLayoutBlock extends Component {
	constructor( props ) {
		super( props );
		const editMode = soPanelsBlockEditorAdmin.defaultMode === 'edit' || isEmpty( props.panelsData );
		this.state = {
			editing: editMode,
			loadingPreview: ! editMode,
			previewHtml: ''
		};
		this.panelsContainer = createRef();
		this.previewContainer = createRef();
		this.panelsInitialized = false;
		this.previewInitialized = false;
	}
	
	componentDidMount() {
		this.isStillMounted = true;
		
		if ( this.state.editing ) {
			this.setupPanels();
		} else if ( ! this.state.editing && ! this.previewInitialized ) {
			this.fetchPreview( this.props );
			this.fetchPreview = debounce( this.fetchPreview, 500 );
		}
	}
	
	componentWillUnmount() {
		this.isStillMounted = false;
		if ( this.builderView ) {
			this.builderView.off( 'content_change' );
		}
	}
	
	componentDidUpdate( prevProps ) {
		// let propsChanged = !isEqual( prevProps.panelsData, this.props.panelsData );
		if ( this.state.editing && ! this.panelsInitialized ) {
			this.setupPanels();
		} else if ( this.state.loadingPreview ) {
			this.fetchPreview( this.props );
		} else if ( ! this.previewInitialized && this.previewContainer.current){
			jQuery( document ).trigger( 'panels_setup_preview' );
			this.previewInitialized = true;
		}
	}
	
	setupPanels() {
		var $panelsContainer = jQuery( this.panelsContainer.current );
		
		var config = {
			editorType: 'standalone'
		};
		
		var builderModel = new panels.model.builder();
		
		this.builderView = new panels.view.builder( {
			model: builderModel,
			config: config
		} );
		
		// Make sure panelsData is defined and clone so that we don't alter the underlying attribute.
		var panelsData = JSON.parse( JSON.stringify( jQuery.extend( {}, this.props.panelsData ) ) );
		
		// Disable block selection while dragging rows or widgets.
		let rowOrWidgetMouseDown = () => {
			if ( isFunction( this.props.onRowOrWidgetMouseDown ) ) {
				this.props.onRowOrWidgetMouseDown();
			}
			let rowOrWidgetMouseUp = () => {
				jQuery( document ).off( 'mouseup', rowOrWidgetMouseUp );
				if ( isFunction( this.props.onRowOrWidgetMouseUp ) ) {
					this.props.onRowOrWidgetMouseUp();
				}
			};
			jQuery( document ).on( 'mouseup', rowOrWidgetMouseUp );
		};
		
		this.builderView.on( 'row_added', () => {
			this.builderView.$( '.so-row-move' ).off( 'mousedown', rowOrWidgetMouseDown );
			this.builderView.$( '.so-row-move' ).on( 'mousedown', rowOrWidgetMouseDown );
			this.builderView.$( '.so-widget' ).off( 'mousedown', rowOrWidgetMouseDown );
			this.builderView.$( '.so-widget' ).on( 'mousedown', rowOrWidgetMouseDown );
		} );
		
		this.builderView.on( 'widget_added', () => {
			this.builderView.$( '.so-widget' ).off( 'mousedown', rowOrWidgetMouseDown );
			this.builderView.$( '.so-widget' ).on( 'mousedown', rowOrWidgetMouseDown );
		} );
		
		this.builderView
		.render()
		.attach( {
			container: $panelsContainer
		} )
		.setData( panelsData );
		
		this.builderView.trigger( 'builder_resize' );
		
		this.builderView.on( 'content_change', () => {
			const newPanelsData = this.builderView.getData();
			this.panelsDataChanged = !isEqual( panelsData, newPanelsData );
			if ( this.panelsDataChanged ) {
				if ( this.props.onContentChange && isFunction( this.props.onContentChange ) ) {
					this.props.onContentChange( newPanelsData );
				}
				this.setState( { loadingPreview: true, previewHtml: '' } );
			}
		} );
		
		jQuery( document ).trigger( 'panels_setup', this.builderView );
		
		this.panelsInitialized = true;
	}
	
	fetchPreview( props ) {
		if ( ! this.isStillMounted ) {
			return;
		}
		
		this.previewInitialized = false;
		
		const fetchRequest = this.currentFetchRequest = jQuery.post( {
			url: soPanelsBlockEditorAdmin.previewUrl,
			data: {
				action: 'so_panels_layout_block_preview',
				panelsData: JSON.stringify( props.panelsData ),
			}
		} )
		.then( ( preview ) => {
			if ( this.isStillMounted && fetchRequest === this.currentFetchRequest && preview ) {
				this.setState( {
					previewHtml: preview,
					loadingPreview: false,
				} );
			}
		} );
		return fetchRequest;
	}
	
	render() {
		const { panelsData } = this.props;
		
		let switchToEditing = () => {
			this.panelsInitialized = false;
			this.setState( { editing: true } );
		}
		
		let switchToPreview = () => {
			if ( panelsData ) {
				this.setState( { editing: false } );
			}
		}
		
		if ( this.state.editing ) {
			return (
				<Fragment>
					<BlockControls>
						<Toolbar>
							<IconButton
								icon="visibility"
								className="components-icon-button components-toolbar__control"
								label={ __( 'Preview layout.', 'siteorigin-panels' ) }
								onClick={ switchToPreview }
							/>
						</Toolbar>
					</BlockControls>
					<div
						key="layout-block"
						className="siteorigin-panels-layout-block-container"
						ref={this.panelsContainer}
					/>
				</Fragment>
			);
		} else {
			const loadingPreview = this.state.loadingPreview;
			return (
				<Fragment>
					<BlockControls>
						<Toolbar>
							<IconButton
								icon="edit"
								className="components-icon-button components-toolbar__control"
								label={ __( 'Edit layout.', 'siteorigin-panels' ) }
								onClick={ switchToEditing }
							/>
						</Toolbar>
					</BlockControls>
					<div key="preview" className="so-panels-block-layout-preview-container">
						{ loadingPreview ? (
							<div className="so-panels-spinner-container">
								<span><Spinner/></span>
							</div>
						) : (
							<div className="so-panels-raw-html-container" ref={this.previewContainer}>
								<RawHTML>{this.state.previewHtml}</RawHTML>
							</div>
						) }
					</div>
				</Fragment>
			);
		}
	}
}

registerBlockType( 'siteorigin-panels/layout-block', {
	title: __( 'SiteOrigin Layout', 'siteorigin-panels' ),
	
	description: __( "Build a layout using SiteOrigin's Page Builder.", 'siteorigin-panels' ),
	
	icon () {
		return <span className="siteorigin-panels-block-icon"/>;
	},
	
	category: 'layout',
	
	keywords: [ 'page builder', 'column,grid', 'panel' ],
	
	supports: {
		html: false,
	},
	
	attributes: {
		panelsData: {
			type: 'object',
		}
	},
	
	edit( { attributes, setAttributes, toggleSelection } ) {
		
		let onLayoutBlockContentChange = ( newPanelsData ) => {
			
			if ( !_.isEmpty( newPanelsData.widgets ) ) {
				// Send panelsData to server for sanitization.
				jQuery.post(
					soPanelsBlockEditorAdmin.sanitizeUrl,
					{
						action: 'so_panels_layout_block_sanitize',
						panelsData: JSON.stringify( newPanelsData ),
					},
					function ( sanitizedPanelsData ) {
						if ( sanitizedPanelsData !== '' ) {
							setAttributes( { panelsData: sanitizedPanelsData } );
						}
					}
				);
			}
		};
		
		let disableSelection = ( ) => {
			toggleSelection( false );
		};
		
		let enableSelection = ( ) => {
			toggleSelection( true );
		};
		
		return (
			<SiteOriginPanelsLayoutBlock
				panelsData={attributes.panelsData}
				onContentChange={onLayoutBlockContentChange}
				onRowOrWidgetMouseDown={disableSelection}
				onRowOrWidgetMouseUp={enableSelection}
			/>
		);
	},
	
	save() {
		// Render in PHP
		return null;
	}
} );

( ( jQuery ) => {
	if ( soPanelsBlockEditorAdmin.showAddButton ) {
		jQuery( () => {
			setTimeout( () => {
				const editorDispatch = wp.data.dispatch( 'core/editor' );
				const editorSelect = wp.data.select( 'core/editor' );
				var tmpl = jQuery( '#siteorigin-panels-add-layout-block-button' ).html();
				var $addButton = jQuery(tmpl).insertAfter( '.editor-writing-flow > div:first' );
				$addButton.on( 'click', () => {
					var layoutBlock = wp.blocks.createBlock( 'siteorigin-panels/layout-block', {} );
					const isEmpty = editorSelect.isEditedPostEmpty();
					if ( isEmpty ) {
						const blocks = editorSelect.getBlocks();
						if ( blocks.length ) {
							editorDispatch.replaceBlock( blocks[0].clientId, layoutBlock );
						} else {
							editorDispatch.insertBlock( layoutBlock );
						}
					} else {
						editorDispatch.insertBlock( layoutBlock );
					}
				} );
				let hideButtonIfBlocks = () => {
					const isEmpty = wp.data.select( 'core/editor' ).isEditedPostEmpty();
					if ( isEmpty ) {
						$addButton.show();
					} else {
						$addButton.hide();
					}
				};
				wp.data.subscribe( hideButtonIfBlocks );
				hideButtonIfBlocks();
			}, 100 );
		} );
	}
	
} )( jQuery );
