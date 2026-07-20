add_executable(27_shadow_mapping main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(27_shadow_mapping glfw opengl32)
endif()

foreach(FILE_NAME
    shadow_mapping.vs
    shadow_mapping.fs
    shadow_mapping_depth.vs
    shadow_mapping_depth.fs
    debug_quad.vs
    debug_quad.fs
)
    add_custom_command(TARGET 27_shadow_mapping POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:27_shadow_mapping>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 27_shadow_mapping POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/images/wall.jpg"
    "$<TARGET_FILE_DIR:27_shadow_mapping>/wall.jpg"
)
