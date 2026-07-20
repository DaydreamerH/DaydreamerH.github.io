add_executable(28_point_shadows main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(28_point_shadows glfw opengl32)
endif()

foreach(FILE_NAME
    point_shadows.vs
    point_shadows.fs
    point_shadows_depth.vs
    point_shadows_depth.fs
    point_shadows_depth.gs
)
    add_custom_command(TARGET 28_point_shadows POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:28_point_shadows>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 28_point_shadows POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/images/wall.jpg"
    "$<TARGET_FILE_DIR:28_point_shadows>/wall.jpg"
)
