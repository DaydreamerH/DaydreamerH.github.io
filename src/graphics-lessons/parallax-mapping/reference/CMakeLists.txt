add_executable(30_parallax_mapping parallax_mapping.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(30_parallax_mapping glfw opengl32)
endif()

add_custom_command(TARGET 30_parallax_mapping POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/parallax_mapping.vs"
    "$<TARGET_FILE_DIR:30_parallax_mapping>/steep_parallax_mapping.vs"
)

add_custom_command(TARGET 30_parallax_mapping POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/parallax_mapping.fs"
    "$<TARGET_FILE_DIR:30_parallax_mapping>/steep_parallax_mapping.fs"
)

foreach(FILE_NAME bricks2.jpg bricks2_normal.jpg bricks2_disp.jpg)
    add_custom_command(TARGET 30_parallax_mapping POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${FILE_NAME}"
        "$<TARGET_FILE_DIR:30_parallax_mapping>/${FILE_NAME}"
    )
endforeach()
